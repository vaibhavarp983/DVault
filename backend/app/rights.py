"""Durable, local-only rights planning and execution for the synthetic DVault demo."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    AuthorizationRecord,
    DataRecordRef,
    Job,
    JobEvent,
    RetentionHold,
    RightsAccessArtifact,
    RightsRequest,
    RightsRequestAction,
    Source,
    SuppressionRecord,
    Workspace,
)
from app.source_store import SourceStore

REQUEST_TYPES = {"ACCESS", "ERASURE", "WITHDRAWAL"}
ACTION_BY_REQUEST_TYPE = {"ACCESS": "ACCESS_EXPORT", "ERASURE": "ERASURE", "WITHDRAWAL": "WITHDRAWAL"}
RETRYABLE_STATUSES = {"PENDING", "FAILED", "RESTRICTED"}


class RightsProblem(Exception):
    def __init__(self, code: str, message: str, status_code: int = 409) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def request_actions(db: Session, request_id: str) -> list[RightsRequestAction]:
    return list(db.scalars(select(RightsRequestAction).where(RightsRequestAction.rights_request_id == request_id).order_by(RightsRequestAction.planned_at, RightsRequestAction.id)))


def create_request(
    db: Session,
    workspace: Workspace,
    subject_ref: str,
    request_type: str,
    idempotency_key: str,
    requester_reference: str | None,
) -> tuple[RightsRequest, bool]:
    normalized_type = request_type.upper()
    if normalized_type not in REQUEST_TYPES:
        raise RightsProblem("INVALID_RIGHTS_REQUEST_TYPE", "request_type must be ACCESS, ERASURE, or WITHDRAWAL.", 422)
    existing = db.scalar(select(RightsRequest).where(RightsRequest.workspace_id == workspace.id, RightsRequest.idempotency_key == idempotency_key))
    if existing is not None:
        return existing, True
    request = RightsRequest(
        workspace_id=workspace.id,
        subject_ref=subject_ref,
        request_type=normalized_type,
        status="CREATED",
        idempotency_key=idempotency_key,
        correlation_id=f"rights:{uuid4()}",
        requester_reference=requester_reference,
        summary_json={"message": "Request created and awaiting planning."},
    )
    db.add(request)
    db.flush()
    return request, False


def _event(db: Session, job: Job, event_type: str, message: str, action: RightsRequestAction | None = None, details: dict | None = None) -> None:
    sequence = (db.scalar(select(func.max(JobEvent.sequence)).where(JobEvent.job_id == job.id)) or 0) + 1
    db.add(JobEvent(job_id=job.id, sequence=sequence, event_type=event_type, action_id=action.id if action else None, message=message, details_json=details or {}))
    db.flush()


def _set_request_status(request: RightsRequest, actions: list[RightsRequestAction]) -> None:
    counts: dict[str, int] = {}
    for action in actions:
        counts[action.status] = counts.get(action.status, 0) + 1
    succeeded = counts.get("SUCCEEDED", 0)
    failed = counts.get("FAILED", 0)
    restricted = counts.get("RESTRICTED", 0)
    if not actions:
        request.status = "NEEDS_REVIEW"
        message = "No confidently matched source records were available for this request."
    elif restricted:
        request.status = "PARTIAL" if succeeded else "NEEDS_REVIEW"
        message = "One or more source actions are restricted by an active retention hold."
    elif failed:
        request.status = "PARTIAL" if succeeded else "FAILED"
        message = "One or more source actions failed; retry eligible actions remain available."
    elif all(action.status == "SUCCEEDED" for action in actions):
        request.status = "COMPLETE"
        message = "All planned source actions completed."
    else:
        request.status = "EXECUTING"
        message = "Eligible source actions are executing."
    request.summary_json = {"message": message, "action_summary": counts, "completed_actions": succeeded, "total_actions": len(actions)}
    if request.status in {"COMPLETE", "PARTIAL", "FAILED", "NEEDS_REVIEW"}:
        request.completed_at = now_utc()


def plan_request(db: Session, workspace: Workspace, request: RightsRequest) -> RightsRequest:
    if request.status not in {"CREATED", "NEEDS_REVIEW"}:
        return request
    request.status = "PLANNING"
    records = list(db.scalars(select(DataRecordRef).where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.subject_ref == request.subject_ref)))
    if not records:
        request.status = "NEEDS_REVIEW"
        request.summary_json = {"message": "The subject reference does not resolve to a confidently inventoried source record.", "reason_code": "SUBJECT_COVERAGE_UNAVAILABLE"}
        request.planned_at = now_utc()
        return request
    action_type = ACTION_BY_REQUEST_TYPE[request.request_type]
    grouped: dict[str, list[DataRecordRef]] = {}
    for record in records:
        grouped.setdefault(record.source_id, []).append(record)
    for source_id, source_records in grouped.items():
        existing = db.scalar(select(RightsRequestAction).where(RightsRequestAction.rights_request_id == request.id, RightsRequestAction.source_id == source_id, RightsRequestAction.action_type == action_type))
        if existing is None:
            db.add(RightsRequestAction(
                rights_request_id=request.id,
                source_id=source_id,
                action_type=action_type,
                status="PENDING",
                idempotency_key=f"{request.id}:{source_id}:{action_type}",
                affected_record_count=len(source_records),
                result_json={"planned_record_count": len(source_records)},
            ))
    request.planned_at = now_utc()
    request.completed_at = None
    db.flush()
    actions = request_actions(db, request.id)
    request.summary_json = {"message": "Source actions planned and ready for execution.", "action_summary": {"PENDING": len(actions)}, "completed_actions": 0, "total_actions": len(actions)}
    return request


def release_hold(hold: RetentionHold, note: str | None) -> RetentionHold:
    if hold.status != "ACTIVE":
        raise RightsProblem("RETENTION_HOLD_NOT_ACTIVE", "Only active retention holds can be released.")
    hold.status = "RELEASED"
    hold.released_at = now_utc()
    if note:
        combined = f"{hold.review_note} | {note}" if hold.review_note else note
        hold.review_note = combined[:320]
    return hold


def _active_holds(db: Session, workspace_id: str, subject_ref: str, source_id: str, records: list[DataRecordRef]) -> list[RetentionHold]:
    record_ids = [record.id for record in records]
    now = now_utc()
    record_scope = RetentionHold.record_ref_id.in_(record_ids) if record_ids else false()
    source_scope = RetentionHold.source_id == source_id
    subject_scope = and_(RetentionHold.subject_ref == subject_ref, RetentionHold.source_id.is_(None), RetentionHold.record_ref_id.is_(None))
    return list(db.scalars(select(RetentionHold).where(
        RetentionHold.workspace_id == workspace_id,
        RetentionHold.status == "ACTIVE",
        or_(RetentionHold.expires_at.is_(None), RetentionHold.expires_at > now),
        or_(record_scope, source_scope, subject_scope),
    )))


def _run_action(db: Session, workspace: Workspace, request: RightsRequest, action: RightsRequestAction, job: Job) -> None:
    source = db.scalar(select(Source).where(Source.workspace_id == workspace.id, Source.id == action.source_id))
    records = list(db.scalars(select(DataRecordRef).where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.source_id == action.source_id, DataRecordRef.subject_ref == request.subject_ref)))
    action.attempt_count += 1
    action.started_at = now_utc()
    if source is None:
        action.status = "FAILED"
        action.retry_eligible = False
        action.error_code = "SOURCE_NOT_FOUND"
        action.error_message = "The source is no longer available."
        action.completed_at = now_utc()
        _event(db, job, "ACTION_FAILED", "Source is no longer available.", action, {"code": action.error_code})
        return
    if action.action_type == "ERASURE":
        holds = _active_holds(db, workspace.id, request.subject_ref, source.id, records)
        if holds:
            action.status = "RESTRICTED"
            action.retry_eligible = True
            action.error_code = "RETENTION_HOLD_ACTIVE"
            action.error_message = "Erasure is restricted by an active retention hold."
            action.result_json = {"hold_count": len(holds), "reason_codes": sorted({hold.reason_code for hold in holds})}
            action.completed_at = now_utc()
            _event(db, job, "ACTION_RESTRICTED", "Erasure action routed to review because a retention hold is active.", action, action.result_json)
            return
    if source.configuration_metadata.get("phase4_failure"):
        action.status = "FAILED"
        action.retry_eligible = True
        action.error_code = "SYNTHETIC_CONNECTOR_FAILURE"
        action.error_message = "The synthetic source connector reported a retryable failure."
        action.result_json = {"source_key": source.source_key}
        action.completed_at = now_utc()
        _event(db, job, "ACTION_FAILED", "Synthetic connector failure recorded.", action, {"code": action.error_code})
        return
    action.status = "RUNNING"
    action.error_code = None
    action.error_message = None
    _event(db, job, "ACTION_STARTED", f"{action.action_type} started for {source.display_name}.", action)
    try:
        if action.action_type == "ACCESS_EXPORT":
            action.result_json = {"source_key": source.source_key, "record_count": len(records), "summary": "Synthetic source access summary compiled."}
        elif action.action_type == "ERASURE":
            deleted = SourceStore(source.id).delete_records([record.source_record_id for record in records])
            for record in records:
                db.delete(record)
            action.result_json = {"source_key": source.source_key, "planned_record_count": action.affected_record_count, "erased_record_count": deleted}
        elif action.action_type == "WITHDRAWAL":
            authorizations = list(db.scalars(select(AuthorizationRecord).where(AuthorizationRecord.workspace_id == workspace.id, AuthorizationRecord.subject_ref == request.subject_ref, AuthorizationRecord.status == "ACTIVE")))
            withdrawn = 0
            suppressions = 0
            for authorization in authorizations:
                authorization.status = "WITHDRAWN"
                authorization.withdrawn_at = now_utc()
                withdrawn += 1
                existing = db.scalar(select(SuppressionRecord).where(SuppressionRecord.workspace_id == workspace.id, SuppressionRecord.subject_ref == request.subject_ref, SuppressionRecord.purpose == authorization.purpose, SuppressionRecord.channel == authorization.channel, SuppressionRecord.status == "ACTIVE"))
                if existing is None:
                    db.add(SuppressionRecord(workspace_id=workspace.id, subject_ref=request.subject_ref, purpose=authorization.purpose, channel=authorization.channel, status="ACTIVE", source="rights_workflow", effective_at=now_utc()))
                    suppressions += 1
            db.flush()
            confirmed = db.scalar(select(func.count(SuppressionRecord.id)).where(SuppressionRecord.workspace_id == workspace.id, SuppressionRecord.subject_ref == request.subject_ref, SuppressionRecord.status == "ACTIVE")) or 0
            action.result_json = {"source_key": source.source_key, "scope": "WORKSPACE_AUTHORIZATIONS", "withdrawn_authorizations": withdrawn, "created_suppressions": suppressions, "confirmed_active_suppressions": confirmed}
        action.status = "SUCCEEDED"
        action.retry_eligible = False
        action.completed_at = now_utc()
        _event(db, job, "ACTION_COMPLETED", f"{action.action_type} completed for {source.display_name}.", action, action.result_json)
    except Exception as exc:
        action.status = "FAILED"
        action.retry_eligible = True
        action.error_code = "SOURCE_CONNECTOR_ERROR"
        action.error_message = "The source connector could not complete the action."
        action.result_json = {"source_key": source.source_key, "error_class": type(exc).__name__}
        action.completed_at = now_utc()
        _event(db, job, "ACTION_FAILED", "The source connector reported an unexpected failure.", action, {"code": action.error_code})


def _refresh_access_artifact(db: Session, request: RightsRequest, actions: list[RightsRequestAction]) -> None:
    if request.request_type != "ACCESS":
        return
    successful = [action for action in actions if action.status == "SUCCEEDED"]
    if not successful:
        return
    artifact = db.scalar(select(RightsAccessArtifact).where(RightsAccessArtifact.rights_request_id == request.id))
    summaries = [action.result_json for action in successful]
    if artifact is None:
        artifact = RightsAccessArtifact(rights_request_id=request.id, status="READY" if request.status == "COMPLETE" else "PARTIAL", source_summaries_json=summaries, expires_at=now_utc() + timedelta(days=7), completed_at=now_utc())
        db.add(artifact)
    else:
        artifact.status = "READY" if request.status == "COMPLETE" else "PARTIAL"
        artifact.source_summaries_json = summaries
        artifact.completed_at = now_utc()


def execute_request(db: Session, workspace: Workspace, request: RightsRequest, retry: bool = False) -> Job:
    if request.status == "CREATED":
        raise RightsProblem("RIGHTS_REQUEST_PLANNING_REQUIRED", "Plan the request before executing it.")
    if request.status == "COMPLETE":
        raise RightsProblem("RIGHTS_REQUEST_ALREADY_COMPLETE", "Completed requests cannot be executed again.")
    actions = request_actions(db, request.id)
    eligible = [action for action in actions if action.status in RETRYABLE_STATUSES and (action.status == "PENDING" or action.retry_eligible)]
    if not eligible:
        raise RightsProblem("RIGHTS_REQUEST_NO_RETRYABLE_ACTIONS", "There are no unresolved eligible source actions to execute.")
    job = Job(workspace_id=workspace.id, rights_request_id=request.id, operation="RIGHTS_RETRY" if retry else "RIGHTS_EXECUTION", status="RUNNING", attempt_count=1, action_total=len(eligible), action_completed=0, correlation_id=request.correlation_id, started_at=now_utc())
    db.add(job)
    db.flush()
    _event(db, job, "JOB_STARTED", "Retry started." if retry else "Rights execution started.", details={"action_total": len(eligible)})
    request.status = "EXECUTING"
    request.completed_at = None
    for action in eligible:
        _run_action(db, workspace, request, action, job)
    actions = request_actions(db, request.id)
    _set_request_status(request, actions)
    _refresh_access_artifact(db, request, actions)
    job.action_completed = len([action for action in eligible if action.status == "SUCCEEDED"])
    job.status = request.status
    job.completed_at = now_utc()
    if request.status in {"FAILED", "PARTIAL", "NEEDS_REVIEW"}:
        job.error_code = next((action.error_code for action in actions if action.error_code), None)
        job.error_message = request.summary_json["message"]
    _event(db, job, "JOB_COMPLETED", f"Rights job finished with {request.status}.", details={"request_status": request.status, "action_summary": request.summary_json.get("action_summary", {})})
    return job
