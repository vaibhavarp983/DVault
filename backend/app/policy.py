import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuthorizationRecord, DataRecordRef, DatasetImport, Policy, PolicyDecision, SuppressionRecord, Workspace

POLICY_KEY = "marketing-authorization"
POLICY_RULES = {
    "required_operation": "managed_marketing",
    "enquiry_follow_up_window_days": 7,
    "note": "Synthetic product-policy configuration; not a legal determination.",
}


@dataclass(frozen=True)
class DecisionResult:
    decision: str
    reason_codes: list[str]
    evaluated_rules: list[str]
    policy_id: str
    policy_version: int
    evaluated_at: datetime
    correlation_id: str


class PolicyProblem(Exception):
    def __init__(self, code: str, message: str, status_code: int = 422) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code


def active_policy(db: Session, workspace_id: str) -> Policy:
    policy = db.scalar(
        select(Policy)
        .where(Policy.workspace_id == workspace_id, Policy.policy_key == POLICY_KEY, Policy.status == "ACTIVE")
        .order_by(Policy.version.desc())
    )
    if policy is None:
        raise PolicyProblem("ACTIVE_POLICY_MISSING", "No active managed-marketing policy is available.", 503)
    return policy


def ensure_default_policy(db: Session, workspace_id: str) -> Policy:
    policy = db.scalar(select(Policy).where(Policy.workspace_id == workspace_id, Policy.policy_key == POLICY_KEY, Policy.version == 1))
    if policy is None:
        policy = Policy(workspace_id=workspace_id, policy_key=POLICY_KEY, version=1, name="Managed marketing authorization", status="ACTIVE", rules_json=POLICY_RULES, synthetic_label="synthetic_demo_policy")
        db.add(policy)
    return policy


def ensure_demo_policy_state(db: Session, workspace_id: str) -> None:
    """Seed stable synthetic decision examples after the fixture inventory exists."""
    ensure_default_policy(db, workspace_id)
    refs = []
    for value in db.scalars(select(DataRecordRef.subject_ref).where(DataRecordRef.workspace_id == workspace_id, DataRecordRef.subject_ref.is_not(None)).order_by(DataRecordRef.source_record_id)):
        if value and value not in refs:
            refs.append(value)
    if not refs:
        return
    now = datetime.now(timezone.utc)

    def add_authorization(subject_ref: str, purpose: str, channel: str, status: str) -> None:
        found = db.scalar(select(AuthorizationRecord).where(AuthorizationRecord.workspace_id == workspace_id, AuthorizationRecord.subject_ref == subject_ref, AuthorizationRecord.purpose == purpose, AuthorizationRecord.channel == channel, AuthorizationRecord.evidence_source == "synthetic Phase 3 demo seed"))
        if found is None:
            db.add(AuthorizationRecord(workspace_id=workspace_id, subject_ref=subject_ref, purpose=purpose, channel=channel, status=status, evidence_source="synthetic Phase 3 demo seed", notice_version="demo-v1", captured_at=now, withdrawn_at=now if status == "WITHDRAWN" else None))

    add_authorization(refs[0], "marketing", "whatsapp", "ACTIVE")
    if len(refs) > 1:
        add_authorization(refs[1], "course_updates", "email", "ACTIVE")
    if len(refs) > 2:
        add_authorization(refs[2], "marketing", "whatsapp", "WITHDRAWN")
        suppressed = db.scalar(select(SuppressionRecord).where(SuppressionRecord.workspace_id == workspace_id, SuppressionRecord.subject_ref == refs[2], SuppressionRecord.purpose == "marketing", SuppressionRecord.channel == "whatsapp", SuppressionRecord.source == "synthetic Phase 3 demo seed"))
        if suppressed is None:
            db.add(SuppressionRecord(workspace_id=workspace_id, subject_ref=refs[2], purpose="marketing", channel="whatsapp", status="ACTIVE", source="synthetic Phase 3 demo seed", effective_at=now))


def _context_fingerprint(operation: str, subject_ref: str | None, purpose: str | None, channel: str | None, match_status: str | None) -> str:
    canonical = json.dumps({"operation": operation, "subject_ref": subject_ref, "purpose": purpose, "channel": channel, "match_status": match_status}, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _decision(result: str, reasons: list[str], rules: list[str], policy: Policy, now: datetime, correlation_id: str | None = None) -> DecisionResult:
    return DecisionResult(result, reasons, rules, policy.id, policy.version, now, correlation_id or str(uuid4()))


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def evaluate_marketing(
    db: Session,
    workspace: Workspace,
    subject_ref: str | None,
    purpose: str | None,
    channel: str | None,
    operation: str = "managed_marketing",
    record: DataRecordRef | None = None,
    correlation_id: str | None = None,
    persist: bool = True,
) -> DecisionResult:
    now = datetime.now(timezone.utc)
    policy = active_policy(db, workspace.id)
    rules = ["operation_scope", "subject_resolution", "purpose_channel", "source_coverage", "suppression", "authorization"]
    match_status = record.match_status if record else None
    if operation != "managed_marketing":
        result = _decision("REVIEW", ["OPERATION_NOT_CONFIGURED"], rules, policy, now, correlation_id)
    elif not subject_ref:
        result = _decision("REVIEW", ["SUBJECT_REFERENCE_MISSING"], rules, policy, now, correlation_id)
    elif not purpose or not channel:
        result = _decision("REVIEW", ["PURPOSE_OR_CHANNEL_MISSING"], rules, policy, now, correlation_id)
    elif record is not None and record.match_status in {"CONFLICT", "REVIEW_REQUIRED", "UNMATCHED"}:
        result = _decision("REVIEW", ["IDENTITY_MATCH_REQUIRES_REVIEW"], rules, policy, now, correlation_id)
    else:
        records = list(db.scalars(select(DataRecordRef).where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.subject_ref == subject_ref)))
        if not records:
            result = _decision("REVIEW", ["SUBJECT_REFERENCE_UNKNOWN"], rules, policy, now, correlation_id)
        elif any(db.scalar(select(DatasetImport.id).where(DatasetImport.id == ref.dataset_import_id, DatasetImport.status == "COMPLETE")) is None for ref in records):
            result = _decision("REVIEW", ["SOURCE_COVERAGE_INCOMPLETE"], rules, policy, now, correlation_id)
        else:
            suppressions = [item for item in db.scalars(select(SuppressionRecord).where(SuppressionRecord.workspace_id == workspace.id, SuppressionRecord.subject_ref == subject_ref, SuppressionRecord.status == "ACTIVE")) if _as_utc(item.effective_at) <= now]
            scoped_suppression = next((item for item in suppressions if item.purpose in (None, purpose) and item.channel in (None, channel)), None)
            if scoped_suppression:
                result = _decision("DENY", ["SUPPRESSION_ACTIVE"], rules, policy, now, correlation_id)
            else:
                authorizations = list(db.scalars(select(AuthorizationRecord).where(AuthorizationRecord.workspace_id == workspace.id, AuthorizationRecord.subject_ref == subject_ref)))
                exact = [item for item in authorizations if item.purpose == purpose and item.channel == channel]
                if any(item.status == "WITHDRAWN" for item in exact):
                    result = _decision("DENY", ["AUTHORIZATION_WITHDRAWN"], rules, policy, now, correlation_id)
                elif any(item.status == "ACTIVE" and item.expires_at is not None and _as_utc(item.expires_at) <= now for item in exact):
                    result = _decision("DENY", ["AUTHORIZATION_EXPIRED"], rules, policy, now, correlation_id)
                elif any(item.status == "ACTIVE" and (item.expires_at is None or _as_utc(item.expires_at) > now) for item in exact):
                    result = _decision("ALLOW", ["AUTHORIZATION_ACTIVE"], rules, policy, now, correlation_id)
                elif authorizations and any(item.purpose == purpose for item in authorizations):
                    result = _decision("DENY", ["CHANNEL_NOT_AUTHORIZED"], rules, policy, now, correlation_id)
                elif authorizations:
                    result = _decision("DENY", ["PURPOSE_NOT_AUTHORIZED"], rules, policy, now, correlation_id)
                else:
                    result = _decision("REVIEW", ["AUTHORIZATION_EVIDENCE_MISSING"], rules, policy, now, correlation_id)
    if persist:
        db.add(PolicyDecision(
            workspace_id=workspace.id, operation=operation, subject_ref=subject_ref, purpose=purpose, channel=channel,
            decision=result.decision, evaluated_rules_json=result.evaluated_rules, reason_codes_json=result.reason_codes,
            policy_id=result.policy_id, policy_version=result.policy_version, correlation_id=result.correlation_id,
            context_fingerprint=_context_fingerprint(operation, subject_ref, purpose, channel, match_status), evaluated_at=result.evaluated_at,
        ))
        db.flush()
    return result


def masked_subject_ref(subject_ref: str) -> str:
    return f"subject:{subject_ref[-8:]}"
