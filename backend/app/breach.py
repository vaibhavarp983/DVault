"""Synthetic breach register, affected-scope lookup, 72-hour timer, and notification drafts."""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.evidence import append_event, iso_utc, sha256_hex
from app.models import (
    AuditEvent,
    BreachAffectedSource,
    BreachAffectedSubject,
    BreachIncident,
    DataRecordRef,
    IntegrityIncident,
    Source,
    Workspace,
    utc_now,
)

ORIGINS = {"MANUAL", "AUDIT_INTEGRITY", "SOURCE_FAILURE", "RIGHTS_FAILURE"}
SEVERITIES = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
ASSESSMENT_WINDOW = timedelta(hours=72)
DISCLAIMER = "Breach notifications are readiness drafts. DVault does not send them."

EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
PHONE_RE = re.compile(r"(?<!\d)(?:\+91[\s-]?)?[6-9]\d{9}(?!\d)")


class BreachProblem(Exception):
    def __init__(self, code: str, message: str, status_code: int = 422) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _redact(value: str | None) -> str:
    if not value:
        return ""
    return PHONE_RE.sub("[redacted]", EMAIL_RE.sub("[redacted]", value))


def breach_timer_state(breach: BreachIncident, now: datetime | None = None) -> str:
    current = _as_utc(now or utc_now())
    if breach.assessed_at is not None or breach.status == "CLOSED":
        return "COMPLETE"
    due = _as_utc(breach.assessment_due_at)
    remaining = due - current
    if remaining.total_seconds() < 0:
        return "OVERDUE"
    if remaining <= timedelta(hours=24):
        return "DUE_SOON"
    return "ON_TRACK"


def assessment_status(breach: BreachIncident) -> str:
    return "ASSESSED" if breach.assessed_at is not None else "PENDING"


def _next_ref(db: Session, workspace_id: str, detected_at: datetime) -> str:
    year = _as_utc(detected_at).year
    total = db.scalar(select(func.count(BreachIncident.id)).where(BreachIncident.workspace_id == workspace_id)) or 0
    for offset in range(1, 1000):
        candidate = f"BR-{year}-{total + offset:04d}"
        exists = db.scalar(select(BreachIncident.id).where(
            BreachIncident.workspace_id == workspace_id,
            BreachIncident.incident_ref == candidate,
        ))
        if exists is None:
            return candidate
    raise BreachProblem("BREACH_REFERENCE_EXHAUSTED", "Could not allocate a breach incident reference.", 409)


def _affected_records(db: Session, workspace_id: str, subject_refs: set[str], source_ids: set[str]) -> list[DataRecordRef]:
    filters = [DataRecordRef.workspace_id == workspace_id]
    if subject_refs and source_ids:
        filters.append(DataRecordRef.subject_ref.in_(subject_refs) | DataRecordRef.source_id.in_(source_ids))
    elif subject_refs:
        filters.append(DataRecordRef.subject_ref.in_(subject_refs))
    elif source_ids:
        filters.append(DataRecordRef.source_id.in_(source_ids))
    else:
        return []
    return list(db.scalars(select(DataRecordRef).where(*filters)))


def _populate_affected(db: Session, workspace: Workspace, breach: BreachIncident, subject_refs: set[str], source_ids: set[str]) -> None:
    records = _affected_records(db, workspace.id, subject_refs, source_ids)
    scoped_sources = set(source_ids) | {record.source_id for record in records}
    scoped_subjects = set(subject_refs) | {record.subject_ref for record in records if record.subject_ref}

    for subject_ref in sorted(scoped_subjects):
        subject_records = [record for record in records if record.subject_ref == subject_ref]
        db.add(BreachAffectedSubject(
            breach_incident_id=breach.id,
            subject_ref=subject_ref,
            resolution_status="RESOLVED" if subject_records else "UNRESOLVED",
            record_count=len(subject_records),
            sources_json=sorted({record.source_id for record in subject_records}),
        ))

    for source_id in sorted(scoped_sources):
        source = db.scalar(select(Source).where(Source.workspace_id == workspace.id, Source.id == source_id))
        if source is None:
            raise BreachProblem("BREACH_SOURCE_UNKNOWN", "One or more affected sources do not belong to this workspace.")
        source_records = [record for record in records if record.source_id == source_id]
        db.add(BreachAffectedSource(
            breach_incident_id=breach.id,
            source_id=source_id,
            affected_record_count=len(source_records),
            affected_subject_count=len({record.subject_ref for record in source_records if record.subject_ref}),
            note=None,
        ))
    db.flush()
    breach.scope_status = "KNOWN" if scoped_subjects or scoped_sources else "UNDETERMINED"


def register_breach(
    db: Session,
    workspace: Workspace,
    *,
    title: str,
    description: str,
    origin: str = "MANUAL",
    origin_ref: str | None = None,
    severity: str = "MEDIUM",
    detected_at: datetime | None = None,
    subject_refs: list[str] | None = None,
    source_ids: list[str] | None = None,
    containment_summary: str | None = None,
    created_by_reference: str | None = None,
    linked_integrity_incident_id: str | None = None,
) -> BreachIncident:
    if origin not in ORIGINS:
        raise BreachProblem("BREACH_ORIGIN_INVALID", "origin is not a supported breach origin.")
    if severity not in SEVERITIES:
        raise BreachProblem("BREACH_SEVERITY_INVALID", "severity must be LOW, MEDIUM, HIGH, or CRITICAL.")
    if not title.strip() or not description.strip():
        raise BreachProblem("BREACH_FIELDS_REQUIRED", "A breach incident needs a non-blank title and description.")
    detected = _as_utc(detected_at or utc_now())
    breach = BreachIncident(
        workspace_id=workspace.id,
        incident_ref=_next_ref(db, workspace.id, detected),
        title=title.strip(),
        description=description.strip(),
        origin=origin,
        origin_ref=origin_ref,
        severity=severity,
        status="DRAFT",
        scope_status="UNDETERMINED",
        detected_at=detected,
        assessment_due_at=detected + ASSESSMENT_WINDOW,
        containment_summary=containment_summary,
        linked_integrity_incident_id=linked_integrity_incident_id,
        created_by_reference=created_by_reference,
    )
    db.add(breach)
    db.flush()
    _populate_affected(db, workspace, breach, set(subject_refs or []), set(source_ids or []))
    append_event(
        db,
        workspace.id,
        "BREACH_INCIDENT_REGISTERED",
        {
            "breach_id": breach.id,
            "incident_ref": breach.incident_ref,
            "origin": breach.origin,
            "severity": breach.severity,
            "scope_status": breach.scope_status,
            "assessment_due_at": iso_utc(breach.assessment_due_at),
        },
        entity_type="breach_incident",
        entity_ref=breach.id,
        occurred_at=detected,
    )
    return breach


def _integrity_candidates(db: Session, workspace_id: str, first_failure_sequence: int) -> tuple[set[str], set[str]]:
    subjects: set[str] = set()
    sources: set[str] = set()
    events = db.scalars(select(AuditEvent).where(
        AuditEvent.workspace_id == workspace_id,
        AuditEvent.sequence >= first_failure_sequence,
    ).order_by(AuditEvent.sequence).limit(500))
    for event in events:
        try:
            payload = json.loads(event.canonical_payload)
        except (TypeError, ValueError):
            continue
        if not isinstance(payload, dict):
            continue
        if isinstance(payload.get("subject_ref"), str):
            subjects.add(payload["subject_ref"])
        if isinstance(payload.get("source_id"), str):
            sources.add(payload["source_id"])
        for value in payload.get("source_ids", []) if isinstance(payload.get("source_ids"), list) else []:
            if isinstance(value, str):
                sources.add(value)
    return subjects, sources


def ensure_integrity_breach(db: Session, workspace_id: str, incident: IntegrityIncident) -> BreachIncident:
    existing = db.scalar(select(BreachIncident).where(
        BreachIncident.workspace_id == workspace_id,
        BreachIncident.linked_integrity_incident_id == incident.id,
    ))
    if existing is not None:
        incident.linked_breach_incident_id = existing.id
        return existing
    workspace = db.scalar(select(Workspace).where(Workspace.id == workspace_id))
    if workspace is None:
        raise BreachProblem("BREACH_WORKSPACE_NOT_FOUND", "The workspace for this incident no longer exists.", 404)
    subjects, sources = _integrity_candidates(db, workspace_id, incident.first_failure_sequence)
    breach = register_breach(
        db,
        workspace,
        title="Evidence integrity failure detected",
        description=f"Verification failed at evidence sequence {incident.first_failure_sequence} with {incident.reason_code}. Scope must be reviewed.",
        origin="AUDIT_INTEGRITY",
        origin_ref=incident.id,
        severity="HIGH",
        subject_refs=sorted(subjects),
        source_ids=sorted(sources),
        containment_summary="Managed dispatch and rights execution are blocked until the integrity incident is reviewed.",
        created_by_reference="audit_verifier",
        linked_integrity_incident_id=incident.id,
    )
    breach.scope_status = "UNDETERMINED"
    incident.linked_breach_incident_id = breach.id
    return breach


def breach_affected(db: Session, breach: BreachIncident) -> dict:
    subject_rows = list(db.scalars(select(BreachAffectedSubject).where(
        BreachAffectedSubject.breach_incident_id == breach.id,
    ).order_by(BreachAffectedSubject.subject_ref)))
    source_rows = list(db.scalars(select(BreachAffectedSource).where(
        BreachAffectedSource.breach_incident_id == breach.id,
    ).order_by(BreachAffectedSource.source_id)))
    sources = {source.id: source for source in db.scalars(select(Source).where(Source.workspace_id == breach.workspace_id))}
    subjects = []
    for row in subject_rows:
        records = list(db.scalars(select(DataRecordRef).where(
            DataRecordRef.workspace_id == breach.workspace_id,
            DataRecordRef.subject_ref == row.subject_ref,
        )))
        if records:
            source_keys = sorted({sources[record.source_id].source_key for record in records if record.source_id in sources})
            record_count = len(records)
            resolution = "RESOLVED"
        else:
            source_keys = sorted({sources[source_id].source_key for source_id in row.sources_json if source_id in sources})
            record_count = row.record_count
            resolution = row.resolution_status
        subjects.append({
            "subject_ref": row.subject_ref,
            "resolution_status": resolution,
            "record_count": record_count,
            "sources": source_keys,
        })
    source_items = []
    for row in source_rows:
        source = sources.get(row.source_id)
        source_items.append({
            "source_id": row.source_id,
            "source_key": source.source_key if source else "unknown",
            "display_name": source.display_name if source else "Unknown source",
            "affected_record_count": row.affected_record_count,
            "affected_subject_count": row.affected_subject_count,
        })
    return {
        "breach_id": breach.id,
        "incident_ref": breach.incident_ref,
        "scope_status": breach.scope_status,
        "subjects": subjects,
        "sources": source_items,
        "generated_at": utc_now(),
        "disclaimer": "Affected scope is derived from control-plane metadata only; raw source content is never read.",
    }


def affected_counts(db: Session, breach_id: str) -> tuple[int, int]:
    subjects = db.scalar(select(func.count(BreachAffectedSubject.id)).where(BreachAffectedSubject.breach_incident_id == breach_id)) or 0
    sources = db.scalar(select(func.count(BreachAffectedSource.id)).where(BreachAffectedSource.breach_incident_id == breach_id)) or 0
    return subjects, sources


def assess_breach(db: Session, breach: BreachIncident, notifiable: bool, reason_code: str, note: str | None) -> BreachIncident:
    if breach.status == "CLOSED":
        raise BreachProblem("BREACH_ALREADY_CLOSED", "A closed breach incident cannot be assessed.", 409)
    now = utc_now()
    breach.assessed_at = now
    breach.notifiable = notifiable
    breach.assessment_reason_code = reason_code
    breach.assessment_note = note
    breach.assessment_timeliness = "COMPLETE_OVERDUE" if now > _as_utc(breach.assessment_due_at) else "COMPLETE_ON_TIME"
    breach.status = "ASSESSED"
    append_event(
        db,
        breach.workspace_id,
        "BREACH_ASSESSED",
        {"breach_id": breach.id, "notifiable": notifiable, "reason_code": reason_code, "timeliness": breach.assessment_timeliness},
        entity_type="breach_incident",
        entity_ref=breach.id,
        occurred_at=now,
    )
    return breach


def draft_notification(db: Session, breach: BreachIncident) -> BreachIncident:
    if breach.assessed_at is None:
        raise BreachProblem("BREACH_ASSESSMENT_REQUIRED", "Complete the breach assessment before drafting a notification.", 409)
    if breach.status == "CLOSED":
        raise BreachProblem("BREACH_ALREADY_CLOSED", "A closed breach incident cannot receive a new draft.", 409)
    affected = breach_affected(db, breach)
    source_lines = ", ".join(f"{item['source_key']} ({item['affected_record_count']} records)" for item in affected["sources"]) or "Unknown"
    assessed = _as_utc(breach.assessed_at)
    body = "\n".join([
        "DRAFT — NOT SENT",
        "DVault breach notification readiness draft",
        "",
        f"Incident: {breach.incident_ref}",
        f"Severity: {breach.severity}",
        f"Detected: {iso_utc(_as_utc(breach.detected_at))}",
        f"Assessment due: {iso_utc(_as_utc(breach.assessment_due_at))}",
        f"Assessed: {iso_utc(assessed)} ({breach.assessment_timeliness})",
        f"Assessment: {'NOTIFIABLE' if breach.notifiable else 'NOT NOTIFIABLE'} ({breach.assessment_reason_code})",
        "",
        f"Affected subjects: {len(affected['subjects'])} pseudonymous references",
        f"Affected sources: {source_lines}",
        "",
        f"Incident summary: {_redact(breach.description)}",
        f"Containment: {_redact(breach.containment_summary) or 'Not recorded.'}",
        "",
        "Next steps: review with legal counsel. If notifiable, notify the Data Protection Board and affected persons without delay.",
        "This draft has not been sent. DVault does not transmit notifications.",
    ])
    breach.notification_subject = f"{breach.incident_ref} — breach notification draft"
    breach.notification_body = body
    breach.notification_status = "DRAFTED"
    breach.notification_drafted_at = utc_now()
    breach.status = "NOTIFICATION_DRAFTED"
    append_event(
        db,
        breach.workspace_id,
        "BREACH_NOTIFICATION_DRAFTED",
        {
            "breach_id": breach.id,
            "affected_subject_total": len(affected["subjects"]),
            "affected_source_total": len(affected["sources"]),
            "draft_status": "DRAFT",
        },
        entity_type="breach_incident",
        entity_ref=breach.id,
        occurred_at=breach.notification_drafted_at,
    )
    return breach


def close_breach(db: Session, breach: BreachIncident, note: str) -> BreachIncident:
    if breach.status == "CLOSED":
        raise BreachProblem("BREACH_ALREADY_CLOSED", "This breach incident is already closed.", 409)
    now = utc_now()
    breach.status = "CLOSED"
    breach.closed_at = now
    breach.close_note = note[:500]
    append_event(
        db,
        breach.workspace_id,
        "BREACH_CLOSED",
        {"breach_id": breach.id, "closed_at": iso_utc(now), "note_sha256": sha256_hex(note)},
        entity_type="breach_incident",
        entity_ref=breach.id,
        occurred_at=now,
    )
    return breach
