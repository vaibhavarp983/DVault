"""Append-only evidence chain, signed checkpoints, verification, and fail-closed controls."""

from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    AuditCheckpoint,
    AuditEvent,
    AuditVerification,
    BreachIncident,
    IntegrityIncident,
    utc_now,
)

EVENT_SCHEMA = "dvault-audit-event-v1"
CHECKPOINT_SCHEMA = "dvault-audit-checkpoint-v1"
PAYLOAD_SCHEMA = "dvault-audit-payload-v1"
GENESIS_HASH = "0" * 64
FAILURE_LIMIT = 20
DISCLAIMER = (
    "Verification establishes consistency with the recorded chain and an Ed25519-signed checkpoint. "
    "It does not establish that every real-world action was recorded or that recorded events are true."
)

EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
PHONE_RE = re.compile(r"(?<!\d)(?:\+91[\s-]?)?[6-9]\d{9}(?!\d)")
HEX64_RE = re.compile(r"^[0-9a-f]{64}$", re.IGNORECASE)
UUID_PATTERN = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.IGNORECASE)
SUBREF_PATTERN = re.compile(r"subref_[0-9a-f]+", re.IGNORECASE)


class EvidenceProblem(Exception):
    def __init__(self, code: str, message: str, status_code: int = 409, details: dict | None = None) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


@dataclass(frozen=True)
class EvidenceGate:
    state: str
    incident_id: str | None = None
    failure_sequence: int | None = None
    reason_code: str | None = None
    untrusted_from_sequence: int | None = None


# Required and optional payload keys per canonical event type. Unknown keys are rejected.
EVENT_SCHEMAS: dict[str, tuple[set[str], set[str]]] = {
    "CHAIN_GENESIS": ({"note"}, set()),
    "IMPORT_COMPLETED": ({"source_id", "source_key", "import_id", "row_count", "document_type"}, set()),
    "POLICY_DECISION_RECORDED": ({"subject_ref", "operation", "purpose", "channel", "decision", "reason_codes", "policy_version", "correlation_id"}, set()),
    "AUTHORIZATION_CAPTURED": ({"subject_ref", "authorization_id", "purpose", "channel", "notice_version", "expires_at"}, set()),
    "AUTHORIZATION_WITHDRAWN": ({"subject_ref", "authorization_id", "purpose", "channel", "suppression_id", "withdrawn_at"}, set()),
    "CAMPAIGN_CREATED": ({"campaign_id", "purpose", "channel", "recipient_total"}, set()),
    "CAMPAIGN_PREVIEWED": ({"campaign_id", "decision_summary"}, set()),
    "CAMPAIGN_EXECUTED": ({"campaign_id", "decision_summary", "outbox_total"}, set()),
    "RIGHTS_REQUEST_CREATED": ({"request_id", "subject_ref", "request_type", "idempotency_key_sha256"}, {"correction_field", "correction_value_sha256"}),
    "RIGHTS_REQUEST_PLANNED": ({"request_id", "action_total", "source_ids"}, set()),
    "RIGHTS_ACTION_COMPLETED": ({"request_id", "action_id", "source_id", "action_type", "status", "attempt_count"}, {"erased_record_count"}),
    "RIGHTS_REQUEST_COMPLETED": ({"request_id", "status", "action_summary"}, set()),
    "ACCESS_ARTIFACT_READY": ({"request_id", "artifact_id", "status", "source_keys"}, set()),
    "PORTABILITY_BUNDLE_READY": ({"request_id", "artifact_id", "status", "source_keys"}, set()),
    "RECTIFICATION_APPLIED": ({"request_id", "action_id", "source_id", "field", "record_count", "value_sha256"}, set()),
    "RETENTION_HOLD_CREATED": ({"hold_id", "reason_code"}, {"subject_ref", "source_id", "record_ref_id", "expires_at"}),
    "RETENTION_HOLD_RELEASED": ({"hold_id", "released_at"}, {"note_sha256"}),
    "AUDIT_CHECKPOINT_CREATED": ({"checkpoint_id", "sequence", "head_hash", "key_id"}, set()),
    "AUDIT_VERIFICATION_FAILED": ({"verification_id", "failure_sequence", "reason_code", "verified_through_sequence"}, set()),
    "INTEGRITY_INCIDENT_OPENED": ({"incident_id", "first_failure_sequence", "reason_code"}, set()),
    "INTEGRITY_INCIDENT_RESOLVED": ({"incident_id", "decision", "note_sha256"}, set()),
    "BREACH_INCIDENT_REGISTERED": ({"breach_id", "incident_ref", "origin", "severity", "scope_status", "assessment_due_at"}, set()),
    "BREACH_ASSESSED": ({"breach_id", "notifiable", "reason_code", "timeliness"}, set()),
    "BREACH_NOTIFICATION_DRAFTED": ({"breach_id", "affected_subject_total", "affected_source_total", "draft_status"}, set()),
    "BREACH_CLOSED": ({"breach_id", "closed_at"}, {"note_sha256"}),
    "MESSAGE_RECORDED": ({"message_id", "conversation_id", "subject_ref", "channel", "direction", "sender", "sequence", "body_sha256", "subject_sha256", "previous_hash", "message_hash"}, set()),
    "MESSAGE_RETENTION_REDUCED": ({"message_id", "conversation_id", "subject_ref", "from_state", "to_state", "run_id"}, set()),
    "MESSAGE_CONTENT_PURGED": ({"message_id", "conversation_id", "subject_ref", "from_state", "to_state", "run_id"}, set()),
    "MESSAGE_CHAIN_TAMPER_DETECTED": ({"message_id", "conversation_id", "subject_ref", "reason_code", "expected_hash", "actual_hash"}, set()),
    "RETENTION_POLICY_UPDATED": ({"policy_version", "previous_version", "rules_summary"}, set()),
    "RETENTION_SWEEP_COMPLETED": ({"run_id", "policy_version", "scanned", "retained", "reduced", "purged", "restricted", "skipped_hold"}, set()),
    "WITHDRAWAL_TIER_UPDATED": ({"tier_key", "version", "effect", "active"}, set()),
    "WITHDRAWAL_TIER_APPLIED": ({"tier_key", "subject_ref", "purposes", "effect"}, {"retention_run_id"}),
}


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def iso_utc(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _utc(value: datetime | None) -> datetime:
    current = value or utc_now()
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return current.astimezone(timezone.utc)


def compute_event_hash(
    workspace_id: str,
    sequence: int,
    event_type: str,
    occurred_at: datetime,
    previous_hash: str,
    payload_sha256: str,
) -> str:
    return sha256_hex(canonical_json({
        "schema": EVENT_SCHEMA,
        "workspace_id": workspace_id,
        "sequence": sequence,
        "event_type": event_type,
        "occurred_at": iso_utc(occurred_at),
        "previous_hash": previous_hash,
        "payload_sha256": payload_sha256,
    }))


def _assert_no_raw_identifiers(value: object, path: str) -> None:
    if isinstance(value, str):
        if value.startswith("subref_") or HEX64_RE.match(value):
            return
        scrubbed = SUBREF_PATTERN.sub("", UUID_PATTERN.sub("", value))
        if EMAIL_RE.search(scrubbed) or PHONE_RE.search(scrubbed):
            raise EvidenceProblem(
                "AUDIT_PAYLOAD_CONTAINS_RAW_IDENTIFIER",
                f"Audit payload field {path} appears to contain a raw identifier.",
                422,
            )
    elif isinstance(value, dict):
        for key, item in value.items():
            _assert_no_raw_identifiers(item, f"{path}.{key}" if path else key)
    elif isinstance(value, (list, tuple)):
        for index, item in enumerate(value):
            _assert_no_raw_identifiers(item, f"{path}[{index}]")


def _validate_event(event_type: str, payload: dict) -> None:
    schema = EVENT_SCHEMAS.get(event_type)
    if schema is None:
        raise EvidenceProblem("AUDIT_EVENT_TYPE_UNKNOWN", f"Unknown audit event type: {event_type}.", 422)
    required, optional = schema
    missing = required - set(payload)
    if missing:
        raise EvidenceProblem("AUDIT_PAYLOAD_MISSING_FIELDS", f"Audit payload is missing: {', '.join(sorted(missing))}.", 422)
    unknown = set(payload) - required - optional
    if unknown:
        raise EvidenceProblem("AUDIT_PAYLOAD_UNEXPECTED_FIELDS", f"Audit payload contains unexpected fields: {', '.join(sorted(unknown))}.", 422)
    _assert_no_raw_identifiers(payload, "")


def _head(db: Session, workspace_id: str) -> AuditEvent | None:
    return db.scalar(
        select(AuditEvent)
        .where(AuditEvent.workspace_id == workspace_id)
        .order_by(AuditEvent.sequence.desc())
        .limit(1)
    )


def _insert_event(
    db: Session,
    workspace_id: str,
    event_type: str,
    payload: dict,
    entity_type: str | None,
    entity_ref: str | None,
    occurred_at: datetime | None,
    actor_reference: str | None,
) -> AuditEvent:
    canonical = canonical_json(payload)
    if len(canonical.encode("utf-8")) > 8192:
        raise EvidenceProblem("AUDIT_PAYLOAD_TOO_LARGE", "Audit payloads are limited to 8 KB.", 422)
    payload_sha256 = sha256_hex(canonical)
    occurred = _utc(occurred_at)
    for attempt in range(2):
        try:
            with db.begin_nested():
                head = _head(db, workspace_id)
                sequence = (head.sequence + 1) if head else 1
                previous_hash = head.event_hash if head else GENESIS_HASH
                event = AuditEvent(
                    workspace_id=workspace_id,
                    sequence=sequence,
                    event_type=event_type,
                    entity_type=entity_type,
                    entity_ref=entity_ref,
                    payload_schema=PAYLOAD_SCHEMA,
                    canonical_payload=canonical,
                    payload_sha256=payload_sha256,
                    previous_hash=previous_hash,
                    event_hash=compute_event_hash(workspace_id, sequence, event_type, occurred, previous_hash, payload_sha256),
                    actor_reference=actor_reference,
                    occurred_at=occurred,
                    recorded_at=_utc(None),
                )
                db.add(event)
                db.flush()
            return event
        except IntegrityError:
            if attempt:
                raise
    raise RuntimeError("unreachable audit sequence allocation state")


def append_event(
    db: Session,
    workspace_id: str,
    event_type: str,
    payload: dict,
    *,
    entity_type: str | None = None,
    entity_ref: str | None = None,
    occurred_at: datetime | None = None,
    actor_reference: str | None = None,
) -> AuditEvent:
    """Append one canonical event. The caller owns the surrounding transaction."""
    _validate_event(event_type, payload)
    has_any = db.scalar(select(AuditEvent.id).where(AuditEvent.workspace_id == workspace_id).limit(1))
    if has_any is None and event_type != "CHAIN_GENESIS":
        _insert_event(
            db,
            workspace_id,
            "CHAIN_GENESIS",
            {"note": "DVault evidence coverage begins at this event."},
            "audit_chain",
            workspace_id,
            occurred_at,
            None,
        )
    return _insert_event(db, workspace_id, event_type, payload, entity_type, entity_ref, occurred_at, actor_reference)


def _load_private_key() -> Ed25519PrivateKey:
    settings = get_settings()
    if settings.audit_signing_key:
        key = serialization.load_pem_private_key(settings.audit_signing_key.encode("utf-8"), password=None)
    else:
        path = Path(settings.audit_signing_key_path)
        if path.exists():
            key = serialization.load_pem_private_key(path.read_bytes(), password=None)
        else:
            if settings.is_production:
                raise EvidenceProblem("AUDIT_SIGNING_KEY_MISSING", "An audit signing key must be configured before checkpoints can be signed.", 503)
            path.parent.mkdir(parents=True, exist_ok=True)
            key = Ed25519PrivateKey.generate()
            path.write_bytes(key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            ))
            try:
                os.chmod(path, 0o600)
            except OSError:
                pass
    if not isinstance(key, Ed25519PrivateKey):
        raise EvidenceProblem("AUDIT_SIGNING_KEY_INVALID", "The configured audit signing key is not an Ed25519 private key.", 503)
    return key


def public_key_hex() -> str:
    return _load_private_key().public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    ).hex()


def _checkpoint_message(checkpoint: AuditCheckpoint) -> bytes:
    return canonical_json({
        "schema": CHECKPOINT_SCHEMA,
        "workspace_id": checkpoint.workspace_id,
        "sequence": checkpoint.sequence,
        "head_hash": checkpoint.head_hash,
        "created_at": iso_utc(checkpoint.created_at),
        "key_id": checkpoint.key_id,
    }).encode("utf-8")


def create_checkpoint(db: Session, workspace_id: str, note: str | None = None) -> AuditCheckpoint:
    if _head(db, workspace_id) is None:
        append_event(
            db,
            workspace_id,
            "CHAIN_GENESIS",
            {"note": "DVault evidence coverage begins at this event."},
            entity_type="audit_chain",
            entity_ref=workspace_id,
        )
    verification = verify_chain(db, workspace_id)
    if verification.status != "VERIFIED":
        raise EvidenceProblem(
            "CHECKPOINT_REQUIRES_VERIFIED_CHAIN",
            "A checkpoint can only be signed after the evidence chain verifies.",
            409,
            {"failure_sequence": verification.failure_sequence, "reason_code": verification.reason_code},
        )
    head = _head(db, workspace_id)
    if head is None:
        raise EvidenceProblem("CHECKPOINT_REQUIRES_EVIDENCE", "There is no evidence to sign yet.", 409)
    settings = get_settings()
    created_at = _utc(None)
    checkpoint = AuditCheckpoint(
        workspace_id=workspace_id,
        sequence=head.sequence,
        head_hash=head.event_hash,
        signature="",
        public_key=public_key_hex(),
        key_id=settings.audit_key_id,
        algorithm="Ed25519",
        note=note[:320] if note else None,
        created_at=created_at,
    )
    checkpoint.signature = _load_private_key().sign(_checkpoint_message(checkpoint)).hex()
    db.add(checkpoint)
    db.flush()
    append_event(
        db,
        workspace_id,
        "AUDIT_CHECKPOINT_CREATED",
        {"checkpoint_id": checkpoint.id, "sequence": checkpoint.sequence, "head_hash": checkpoint.head_hash, "key_id": checkpoint.key_id},
        entity_type="audit_checkpoint",
        entity_ref=checkpoint.id,
        occurred_at=created_at,
    )
    return checkpoint


def _payload_malformed(event: AuditEvent) -> str | None:
    try:
        payload = json.loads(event.canonical_payload)
    except (TypeError, ValueError):
        return "The canonical payload is not valid JSON."
    if not isinstance(payload, dict):
        return "The canonical payload is not a JSON object."
    if event.payload_schema != PAYLOAD_SCHEMA:
        return "The payload schema marker is not recognised."
    schema = EVENT_SCHEMAS.get(event.event_type)
    if schema is None:
        return "The event type is not part of the accepted event schema."
    if schema[0] - set(payload):
        return "The payload is missing required fields."
    return None


def _checkpoint_failure(db: Session, event_by_sequence: dict[int, AuditEvent], head_sequence: int, checkpoint: AuditCheckpoint) -> tuple[dict | None, bool]:
    if checkpoint.sequence > head_sequence:
        return {"sequence": head_sequence + 1, "reason_code": "CHECKPOINT_AHEAD_OF_CHAIN", "detail": "The checkpoint is ahead of the recorded chain, which indicates truncated evidence."}, False
    event = event_by_sequence.get(checkpoint.sequence)
    if event is None:
        return {"sequence": checkpoint.sequence, "reason_code": "CHECKPOINT_NOT_FOUND", "detail": "The checkpoint references a missing evidence event."}, False
    if checkpoint.head_hash != event.event_hash:
        return {"sequence": checkpoint.sequence, "reason_code": "CHECKPOINT_HEAD_MISMATCH", "detail": "The checkpoint head hash does not match the recorded event."}, False
    try:
        configured_key = public_key_hex()
    except EvidenceProblem as exc:
        return {"sequence": checkpoint.sequence, "reason_code": "CHECKPOINT_KEY_UNTRUSTED", "detail": exc.message}, False
    if checkpoint.public_key != configured_key:
        return {"sequence": checkpoint.sequence, "reason_code": "CHECKPOINT_KEY_UNTRUSTED", "detail": "The checkpoint was signed with a key that is not trusted by this deployment."}, False
    try:
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(checkpoint.public_key)).verify(
            bytes.fromhex(checkpoint.signature),
            _checkpoint_message(checkpoint),
        )
    except Exception:
        return {"sequence": checkpoint.sequence, "reason_code": "CHECKPOINT_SIGNATURE_INVALID", "detail": "The checkpoint signature is invalid."}, False
    return None, True


def sequence_anomaly(sequences: list[int]) -> tuple[int, str, str] | None:
    if not sequences:
        return None
    if sequences[0] != 1:
        return sequences[0], "CHAIN_SEQUENCE_GAP", "The evidence chain does not begin at sequence 1."
    for previous, current in zip(sequences, sequences[1:]):
        if current == previous:
            return current, "CHAIN_EVENT_REORDERED", "The evidence chain contains a duplicate sequence number."
        if current < previous:
            return current, "CHAIN_EVENT_REORDERED", "Evidence sequence numbers are not increasing."
        if current != previous + 1:
            return current, "CHAIN_SEQUENCE_GAP", "An evidence sequence number is missing."
    return None


def verify_chain(
    db: Session,
    workspace_id: str,
    checkpoint_sequence: int | None = None,
    *,
    auto_resolve: bool = True,
) -> AuditVerification:
    events = list(db.scalars(
        select(AuditEvent).where(AuditEvent.workspace_id == workspace_id).order_by(AuditEvent.sequence)
    ))
    now = _utc(None)
    failures: list[dict] = []
    anomaly = sequence_anomaly([event.sequence for event in events])
    if anomaly:
        failures.append({"sequence": anomaly[0], "reason_code": anomaly[1], "detail": anomaly[2]})
    else:
        previous: AuditEvent | None = None
        for event in events:
            malformed = _payload_malformed(event)
            if malformed:
                failures.append({"sequence": event.sequence, "reason_code": "EVENT_PAYLOAD_MALFORMED", "detail": malformed})
                break
            expected_previous = previous.event_hash if previous else GENESIS_HASH
            if event.previous_hash != expected_previous:
                failures.append({"sequence": event.sequence, "reason_code": "CHAIN_LINK_BROKEN", "detail": "The event does not link to the preceding event hash."})
                break
            recomputed = compute_event_hash(
                event.workspace_id,
                event.sequence,
                event.event_type,
                event.occurred_at,
                event.previous_hash,
                event.payload_sha256,
            )
            if recomputed != event.event_hash or sha256_hex(event.canonical_payload) != event.payload_sha256:
                failures.append({"sequence": event.sequence, "reason_code": "CHAIN_EVENT_EDITED", "detail": "The event hash or payload digest does not match the stored values."})
                break
            previous = event

    checkpoint: AuditCheckpoint | None = None
    checkpoint_status = "MISSING"
    checkpoint_signed: bool | None = None
    if checkpoint_sequence is not None:
        checkpoint = db.scalar(select(AuditCheckpoint).where(
            AuditCheckpoint.workspace_id == workspace_id,
            AuditCheckpoint.sequence == checkpoint_sequence,
        ))
        if checkpoint is None:
            failures.append({"sequence": checkpoint_sequence, "reason_code": "CHECKPOINT_NOT_FOUND", "detail": "The requested checkpoint does not exist."})
            checkpoint_status = "NOT_FOUND"
    else:
        checkpoint = db.scalar(select(AuditCheckpoint).where(AuditCheckpoint.workspace_id == workspace_id).order_by(AuditCheckpoint.sequence.desc()).limit(1))

    if checkpoint is not None:
        if failures:
            checkpoint_status = "UNCHECKED"
        else:
            checkpoint_status = "INVALID"
            by_sequence = {event.sequence: event for event in events}
            head_sequence = events[-1].sequence if events else 0
            failure, signed = _checkpoint_failure(db, by_sequence, head_sequence, checkpoint)
            checkpoint_signed = signed
            if failure:
                failures.append(failure)
            else:
                checkpoint_status = "VALID"

    failure = failures[0] if failures else None
    status = "FAILED" if failure else "VERIFIED"
    if failure:
        verified_through = max(0, failure["sequence"] - 1)
        untrusted_from = failure["sequence"]
        evidence_state = "UNTRUSTED"
    else:
        verified_through = events[-1].sequence if events else None
        untrusted_from = None
        evidence_state = "VERIFIED_WITH_CHECKPOINT" if checkpoint_signed else ("VERIFIED_CHAIN_ONLY" if events else "UNVERIFIED")

    verification = AuditVerification(
        workspace_id=workspace_id,
        status=status,
        evidence_state=evidence_state,
        checked_event_total=len(events),
        verified_through_sequence=verified_through,
        failure_sequence=failure["sequence"] if failure else None,
        untrusted_from_sequence=untrusted_from,
        reason_code=failure["reason_code"] if failure else None,
        reason_message=failure["detail"] if failure else None,
        failures_json=failures[:FAILURE_LIMIT],
        checkpoint_sequence=checkpoint.sequence if checkpoint else None,
        checkpoint_status=checkpoint_status,
        checkpoint_signed=checkpoint_signed,
        verified_at=now,
    )
    db.add(verification)
    db.flush()

    if failure:
        incident = db.scalar(select(IntegrityIncident).where(
            IntegrityIncident.workspace_id == workspace_id,
            IntegrityIncident.status.in_(("OPEN", "ACKNOWLEDGED")),
            IntegrityIncident.first_failure_sequence == failure["sequence"],
        ))
        if incident is None:
            incident = IntegrityIncident(
                workspace_id=workspace_id,
                status="OPEN",
                first_failure_sequence=failure["sequence"],
                reason_code=failure["reason_code"],
                reason_message=failure["detail"],
                verification_id=verification.id,
                detected_at=now,
                last_detected_at=now,
            )
            db.add(incident)
            db.flush()
            append_event(
                db,
                workspace_id,
                "INTEGRITY_INCIDENT_OPENED",
                {"incident_id": incident.id, "first_failure_sequence": incident.first_failure_sequence, "reason_code": incident.reason_code},
                entity_type="integrity_incident",
                entity_ref=incident.id,
                occurred_at=now,
            )
            from app.breach import ensure_integrity_breach

            ensure_integrity_breach(db, workspace_id, incident)
        else:
            incident.last_detected_at = now
            incident.verification_id = verification.id
        append_event(
            db,
            workspace_id,
            "AUDIT_VERIFICATION_FAILED",
            {
                "verification_id": verification.id,
                "failure_sequence": verification.failure_sequence,
                "reason_code": verification.reason_code,
                "verified_through_sequence": verification.verified_through_sequence,
            },
            entity_type="audit_verification",
            entity_ref=verification.id,
            occurred_at=now,
        )
    elif auto_resolve:
        active = list(db.scalars(select(IntegrityIncident).where(
            IntegrityIncident.workspace_id == workspace_id,
            IntegrityIncident.status.in_(("OPEN", "ACKNOWLEDGED")),
        )))
        for incident in active:
            incident.status = "RESOLVED"
            incident.resolved_at = now
            incident.resolution_decision = "AUTO_RESOLVED_RESTORED_CHAIN"
            incident.resolution_note = "A later verification passed."
            append_event(
                db,
                workspace_id,
                "INTEGRITY_INCIDENT_RESOLVED",
                {"incident_id": incident.id, "decision": incident.resolution_decision, "note_sha256": sha256_hex(incident.resolution_note)},
                entity_type="integrity_incident",
                entity_ref=incident.id,
                occurred_at=now,
            )
    return verification


def resolve_integrity_incident(db: Session, incident: IntegrityIncident, decision: str, note: str) -> IntegrityIncident:
    if incident.status == "RESOLVED":
        raise EvidenceProblem("INTEGRITY_INCIDENT_ALREADY_RESOLVED", "This integrity incident is already resolved.", 409)
    now = _utc(None)
    if decision == "ACKNOWLEDGE_EXCEPTION":
        incident.status = "ACKNOWLEDGED"
        incident.acknowledged_at = now
        incident.resolution_decision = decision
    elif decision == "RESTORE_VERIFIED":
        verification = verify_chain(db, incident.workspace_id, auto_resolve=False)
        if verification.status != "VERIFIED":
            raise EvidenceProblem(
                "INTEGRITY_STILL_FAILING",
                "The evidence chain still fails verification; restore the evidence before resolving this incident.",
                409,
                {"failure_sequence": verification.failure_sequence, "reason_code": verification.reason_code},
            )
        incident.status = "RESOLVED"
        incident.resolved_at = now
        incident.resolution_decision = decision
    else:
        raise EvidenceProblem("INTEGRITY_DECISION_INVALID", "decision must be ACKNOWLEDGE_EXCEPTION or RESTORE_VERIFIED.", 422)
    incident.resolution_note = note[:500]
    append_event(
        db,
        incident.workspace_id,
        "INTEGRITY_INCIDENT_RESOLVED",
        {"incident_id": incident.id, "decision": decision, "note_sha256": sha256_hex(note)},
        entity_type="integrity_incident",
        entity_ref=incident.id,
        occurred_at=now,
    )
    return incident


def evidence_gate(db: Session, workspace_id: str) -> EvidenceGate:
    open_incident = db.scalar(select(IntegrityIncident).where(
        IntegrityIncident.workspace_id == workspace_id,
        IntegrityIncident.status == "OPEN",
    ).order_by(IntegrityIncident.detected_at.desc()))
    if open_incident is not None:
        return EvidenceGate("BLOCKED", open_incident.id, open_incident.first_failure_sequence, open_incident.reason_code, open_incident.first_failure_sequence)
    latest = db.scalar(select(AuditVerification).where(
        AuditVerification.workspace_id == workspace_id,
    ).order_by(AuditVerification.verified_at.desc()))
    if latest is not None and latest.status == "FAILED":
        acknowledged = db.scalar(select(IntegrityIncident).where(
            IntegrityIncident.workspace_id == workspace_id,
            IntegrityIncident.status == "ACKNOWLEDGED",
        ).order_by(IntegrityIncident.detected_at.desc()))
        if acknowledged is not None:
            return EvidenceGate("OPEN", acknowledged.id, latest.failure_sequence, latest.reason_code, latest.untrusted_from_sequence)
        return EvidenceGate("BLOCKED", None, latest.failure_sequence, latest.reason_code, latest.untrusted_from_sequence)
    return EvidenceGate("OPEN")


def ensure_evidence_trusted(db: Session, workspace_id: str, operation: str) -> None:
    gate = evidence_gate(db, workspace_id)
    if gate.state == "BLOCKED":
        raise EvidenceProblem(
            "EVIDENCE_UNTRUSTED",
            "Managed operations are blocked until the evidence integrity incident is reviewed.",
            409,
            {
                "operation": operation,
                "incident_id": gate.incident_id,
                "failure_sequence": gate.failure_sequence,
                "reason_code": gate.reason_code,
                "untrusted_from_sequence": gate.untrusted_from_sequence,
            },
        )


def trusted_through_sequence(db: Session, workspace_id: str) -> int | None:
    latest = db.scalar(select(AuditVerification).where(
        AuditVerification.workspace_id == workspace_id,
    ).order_by(AuditVerification.verified_at.desc()))
    if latest is None:
        return None
    if latest.status == "VERIFIED":
        return latest.verified_through_sequence
    if latest.untrusted_from_sequence is None:
        return latest.verified_through_sequence
    return max(0, latest.untrusted_from_sequence - 1)


def event_trust_state(db: Session, workspace_id: str, sequence: int) -> str:
    trusted = trusted_through_sequence(db, workspace_id)
    if trusted is None:
        return "UNVERIFIED"
    return "TRUSTED" if sequence <= trusted else "UNTRUSTED"


def audit_status(db: Session, workspace_id: str) -> dict:
    head = _head(db, workspace_id)
    latest = db.scalar(select(AuditVerification).where(
        AuditVerification.workspace_id == workspace_id,
    ).order_by(AuditVerification.verified_at.desc()))
    checkpoint = db.scalar(select(AuditCheckpoint).where(
        AuditCheckpoint.workspace_id == workspace_id,
    ).order_by(AuditCheckpoint.sequence.desc()).limit(1))
    gate = evidence_gate(db, workspace_id)
    incident_rows = db.execute(
        select(IntegrityIncident.status, func.count(IntegrityIncident.id))
        .where(IntegrityIncident.workspace_id == workspace_id)
        .group_by(IntegrityIncident.status)
    )
    incidents = {status: count for status, count in incident_rows}
    now = _utc(None)
    open_breaches = db.scalar(select(func.count(BreachIncident.id)).where(
        BreachIncident.workspace_id == workspace_id,
        BreachIncident.status != "CLOSED",
    )) or 0
    overdue = db.scalar(select(func.count(BreachIncident.id)).where(
        BreachIncident.workspace_id == workspace_id,
        BreachIncident.status != "CLOSED",
        BreachIncident.assessed_at.is_(None),
        BreachIncident.assessment_due_at < now,
    )) or 0
    drafts = db.scalar(select(func.count(BreachIncident.id)).where(
        BreachIncident.workspace_id == workspace_id,
        BreachIncident.status != "CLOSED",
        BreachIncident.notification_status == "DRAFTED",
    )) or 0
    first_event = db.scalar(select(AuditEvent).where(
        AuditEvent.workspace_id == workspace_id,
        AuditEvent.sequence == 1,
    ))
    return {
        "workspace_id": workspace_id,
        "chain_head_sequence": head.sequence if head else 0,
        "chain_head_hash": head.event_hash if head else None,
        "event_total": db.scalar(select(func.count(AuditEvent.id)).where(AuditEvent.workspace_id == workspace_id)) or 0,
        "first_recorded_at": first_event.recorded_at if first_event else None,
        "checkpoint": checkpoint,
        "verification": latest,
        "gate": gate,
        "incidents": {
            "open": incidents.get("OPEN", 0),
            "acknowledged": incidents.get("ACKNOWLEDGED", 0),
            "resolved": incidents.get("RESOLVED", 0),
        },
        "breaches": {
            "open": open_breaches,
            "assessment_overdue": overdue,
            "drafts_pending": drafts,
        },
        "disclaimer": DISCLAIMER,
    }
