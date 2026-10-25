"""Development-only rehearsal controls: source failure, retention hold, and audit tampering."""

from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.evidence import append_event, canonical_json, iso_utc, verify_chain
from app.messaging import verify_conversation
from app.models import (
    AuditEvent,
    Conversation,
    ConversationMessage,
    DemoFailureLog,
    RetentionHold,
    Source,
    Workspace,
    utc_now,
)
from app.rights import create_hold, release_hold

TAMPER_EXCLUDED = {
    "CHAIN_GENESIS",
    "AUDIT_CHECKPOINT_CREATED",
    "AUDIT_VERIFICATION_FAILED",
    "INTEGRITY_INCIDENT_OPENED",
    "INTEGRITY_INCIDENT_RESOLVED",
}


class DemoProblem(Exception):
    def __init__(self, code: str, message: str, status_code: int = 409) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code


def require_failure_controls() -> None:
    settings = get_settings()
    if settings.is_production or not settings.enable_demo_controls or not settings.enable_failure_injection:
        raise DemoProblem("DEMO_CONTROLS_DISABLED", "Rehearsal controls are disabled in this environment.", 403)


def _log(db: Session, workspace: Workspace, kind: str, target_ref: str | None, details: dict) -> DemoFailureLog:
    entry = DemoFailureLog(workspace_id=workspace.id, kind=kind, target_ref=target_ref, details_json=details, created_at=utc_now())
    db.add(entry)
    db.flush()
    return entry


def inject_source_failure(db: Session, workspace: Workspace, target_id: str | None) -> Source:
    source = db.scalar(select(Source).where(Source.workspace_id == workspace.id, Source.id == target_id)) if target_id else db.scalar(select(Source).where(Source.workspace_id == workspace.id).order_by(Source.source_key))
    if source is None:
        raise DemoProblem("DEMO_SOURCE_NOT_FOUND", "The selected source was not found.", 404)
    metadata = dict(source.configuration_metadata or {})
    metadata["phase4_failure"] = True
    source.configuration_metadata = metadata
    _log(db, workspace, "source_connector", source.id, {"source_id": source.id})
    return source


def inject_retention_hold(db: Session, workspace: Workspace, target_id: str | None) -> RetentionHold:
    subject = target_id
    if subject is None:
        from app.demo_projection import resolve_demo_subject

        subject = resolve_demo_subject(db, workspace)
    if not subject:
        raise DemoProblem("DEMO_SUBJECT_NOT_FOUND", "No demo subject is available for a retention hold.", 409)
    hold = create_hold(
        db,
        workspace,
        subject,
        None,
        None,
        "DEMO_REHEARSAL",
        "Injected by the demo rehearsal controls.",
        None,
    )
    _log(db, workspace, "retention_hold", hold.id, {"hold_id": hold.id})
    return hold


def inject_audit_tamper(db: Session, workspace: Workspace) -> AuditEvent:
    existing = db.scalar(select(DemoFailureLog).where(
        DemoFailureLog.workspace_id == workspace.id,
        DemoFailureLog.kind == "audit_tamper",
    ))
    if existing is not None:
        raise DemoProblem("TAMPER_ALREADY_ACTIVE", "An audit tamper is already active; clear it before injecting another.", 409)
    event = db.scalar(select(AuditEvent).where(
        AuditEvent.workspace_id == workspace.id,
        AuditEvent.event_type.not_in(TAMPER_EXCLUDED),
    ).order_by(AuditEvent.sequence.desc()).limit(1))
    if event is None:
        raise DemoProblem("TAMPER_EVENT_NOT_FOUND", "There is no domain event available to tamper with.", 409)
    original = event.canonical_payload
    payload = json.loads(original)
    if isinstance(payload.get("row_count"), int):
        payload["row_count"] = payload["row_count"] + 1
    elif isinstance(payload.get("action_total"), int):
        payload["action_total"] = payload["action_total"] + 1
    elif "note" in payload:
        payload["note"] = "Demo tamper rehearsal"
    else:
        payload["demo_tamper"] = "rehearsal"
    event.canonical_payload = canonical_json(payload)
    _log(db, workspace, "audit_tamper", event.id, {"sequence": event.sequence, "original": original})
    db.flush()
    verify_chain(db, workspace.id)
    return event


def inject_message_tamper(db: Session, workspace: Workspace, target_id: str | None = None) -> ConversationMessage:
    existing = db.scalar(select(DemoFailureLog).where(
        DemoFailureLog.workspace_id == workspace.id,
        DemoFailureLog.kind == "message_tamper",
    ))
    if existing is not None:
        raise DemoProblem("MESSAGE_TAMPER_ALREADY_ACTIVE", "A message tamper is already active; clear it before injecting another.", 409)
    query = select(ConversationMessage).join(
        Conversation,
        Conversation.id == ConversationMessage.conversation_id,
    ).where(
        ConversationMessage.workspace_id == workspace.id,
        ConversationMessage.retention_state == "FULL",
        ConversationMessage.body.is_not(None),
    ).order_by(ConversationMessage.sent_at.desc())
    if target_id:
        query = query.where(ConversationMessage.conversation_id == target_id)
    message = db.scalar(query.limit(1))
    if message is None:
        raise DemoProblem("MESSAGE_TAMPER_NOT_FOUND", "There is no retained message available to tamper with.", 409)
    original = message.body or ""
    message.body = f"{original}\n[injected tamper rehearsal]"
    _log(db, workspace, "message_tamper", message.id, {"conversation_id": message.conversation_id, "original_body": original})
    db.flush()
    verify_conversation(db, workspace, message.conversation_id)
    return message


def clear_failures(db: Session, workspace: Workspace) -> int:
    logs = list(db.scalars(select(DemoFailureLog).where(DemoFailureLog.workspace_id == workspace.id)))
    cleared = 0
    for entry in logs:
        details = entry.details_json or {}
        if entry.kind == "source_connector":
            source = db.scalar(select(Source).where(Source.id == details.get("source_id")))
            if source is not None:
                metadata = dict(source.configuration_metadata or {})
                metadata.pop("phase4_failure", None)
                source.configuration_metadata = metadata
            cleared += 1
        elif entry.kind == "retention_hold":
            hold = db.scalar(select(RetentionHold).where(RetentionHold.id == details.get("hold_id")))
            if hold is not None and hold.status == "ACTIVE":
                release_hold(hold, "Demo rehearsal controls cleared the hold.")
                append_event(
                    db,
                    workspace.id,
                    "RETENTION_HOLD_RELEASED",
                    {"hold_id": hold.id, "released_at": iso_utc(hold.released_at), "note_sha256": None},
                    entity_type="retention_hold",
                    entity_ref=hold.id,
                    occurred_at=hold.released_at,
                )
            cleared += 1
        elif entry.kind == "audit_tamper":
            event = db.scalar(select(AuditEvent).where(AuditEvent.id == entry.target_ref))
            if event is not None and details.get("original"):
                event.canonical_payload = details["original"]
            cleared += 1
        elif entry.kind == "message_tamper":
            message = db.scalar(select(ConversationMessage).where(ConversationMessage.id == entry.target_ref))
            if message is not None:
                message.body = details.get("original_body", message.body)
                message.tamper_state = "VERIFIED"
                conversation_id = details.get("conversation_id") or message.conversation_id
                db.flush()
                verify_conversation(db, workspace, conversation_id)
            cleared += 1
        db.delete(entry)
    db.flush()
    if cleared:
        verify_chain(db, workspace.id)
    return cleared
