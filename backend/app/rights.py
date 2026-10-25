"""Durable, local-only rights planning and execution for the synthetic DVault demo."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.orm import Session

from app.evidence import append_event, ensure_evidence_trusted, iso_utc, sha256_hex
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

REQUEST_TYPES = {"ACCESS", "ERASURE", "WITHDRAWAL", "PORTABILITY", "RECTIFICATION"}
ACTION_BY_REQUEST_TYPE = {
    "ACCESS": "ACCESS_EXPORT",
    "ERASURE": "ERASURE",
    "WITHDRAWAL": "WITHDRAWAL",
    "PORTABILITY": "PORTABILITY_EXPORT",
    "RECTIFICATION": "RECTIFICATION",
}
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


def _next_reference(db: Session, workspace_id: str, now: datetime) -> str:
    total = db.scalar(select(func.count(RightsRequest.id)).where(RightsRequest.workspace_id == workspace_id)) or 0
    for offset in range(1, 1000):
        candidate = f"RR-{now.year}-{total + offset:04d}"
        exists = db.scalar(select(RightsRequest.id).where(RightsRequest.workspace_id == workspace_id, RightsRequest.reference == candidate))
        if exists is None:
            return candidate
    raise RightsProblem("RIGHTS_REFERENCE_EXHAUSTED", "Could not allocate a rights request reference.", 409)


def _normalise_correction(request_type: str, correction: dict | None) -> dict:
    if request_type != "RECTIFICATION":
        return {}
    if not correction or not str(correction.get("field", "")).strip() or not str(correction.get("requested_value", "")).strip():
        raise RightsProblem("RECTIFICATION_DETAILS_REQUIRED", "A rectification request needs a field and the requested value.", 422)
    return {
        "field": str(correction["field"]).strip()[:120],
        "requested_value": str(correction["requested_value"]).strip()[:500],
        "reason": str(correction.get("reason", "")).strip()[:500] or None,
    }


def create_request(
    db: Session,
    workspace: Workspace,
    subject_ref: str,
    request_type: str,
    idempotency_key: str,
    requester_reference: str | None,
    correction: dict | None = None,
) -> tuple[RightsRequest, bool]:
    normalized_type = request_type.upper()
    if normalized_type == "OBJECTION":
        normalized_type = "WITHDRAWAL"
    if normalized_type not in REQUEST_TYPES:
        raise RightsProblem("INVALID_RIGHTS_REQUEST_TYPE", "request_type must be ACCESS, ERASURE, WITHDRAWAL, PORTABILITY, or RECTIFICATION.", 422)
    existing = db.scalar(select(RightsRequest).where(RightsRequest.workspace_id == workspace.id, RightsRequest.idempotency_key == idempotency_key))
    if existing is not None:
        return existing, True
    normalized_correction = _normalise_correction(normalized_type, correction)
    created_at = now_utc()
    request = RightsRequest(
        workspace_id=workspace.id,
        subject_ref=subject_ref,
        request_type=normalized_type,
        status="CREATED",
        idempotency_key=idempotency_key,
        correlation_id=f"rights:{uuid4()}",
        requester_reference=requester_reference,
        summary_json={"message": "Request created and awaiting planning."},
        reference=_next_reference(db, workspace.id, created_at),
        due_at=created_at + timedelta(days=30),
        correction_json=normalized_correction,
        created_at=created_at,
    )
    db.add(request)
    db.flush()
    payload = {
        "request_id": request.id,
        "subject_ref": subject_ref,
        "request_type": normalized_type,
        "idempotency_key_sha256": sha256_hex(idempotency_key),
    }
    if normalized_correction:
        payload["correction_field"] = normalized_correction["field"]
        payload["correction_value_sha256"] = sha256_hex(normalized_correction["requested_value"])
    append_event(
        db,
        workspace.id,
        "RIGHTS_REQUEST_CREATED",
        payload,
        entity_type="rights_request",
        entity_ref=request.id,
    )
    return request, False


def _event(db: Session, job: Job, event_type: str, message: str, action: RightsRequestAction | None = None, details: dict | None = None) -> None:
    sequence = (db.scalar(select(func.max(JobEvent.sequence)).where(JobEvent.job_id == job.id)) or 0) + 1
    db.add(JobEvent(job_id=job.id, sequence=sequence, event_type=event_type, action_id=action.id if action else None, message=message, details_json=details or {}))
    db.flush()


def _set_request_status(db: Session, request: RightsRequest, actions: list[RightsRequestAction]) -> None:
    previous = request.status
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
        if request.status != previous:
            append_event(
                db,
                request.workspace_id,
                "RIGHTS_REQUEST_COMPLETED",
                {"request_id": request.id, "status": request.status, "action_summary": counts},
                entity_type="rights_request",
                entity_ref=request.id,
            )


def plan_request(db: Session, workspace: Workspace, request: RightsRequest) -> RightsRequest:
    ensure_evidence_trusted(db, workspace.id, "rights_planning")
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
    correction_field = str((request.correction_json or {}).get("field", "")).strip()
    grouped: dict[str, list[DataRecordRef]] = {}
    for record in records:
        if action_type == "RECTIFICATION" and not (record.field_metadata_json or {}).get(correction_field, {}).get("present"):
            continue
        grouped.setdefault(record.source_id, []).append(record)
    if not grouped:
        request.status = "NEEDS_REVIEW"
        request.summary_json = {"message": "No inventoried source record contains the field requested for correction.", "reason_code": "RECTIFICATION_FIELD_UNAVAILABLE"}
        request.planned_at = now_utc()
        return request
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
    append_event(
        db,
        workspace.id,
        "RIGHTS_REQUEST_PLANNED",
        {"request_id": request.id, "action_total": len(actions), "source_ids": sorted(grouped)},
        entity_type="rights_request",
        entity_ref=request.id,
    )
    return request


def create_hold(
    db: Session,
    workspace: Workspace,
    subject_ref: str | None,
    source_id: str | None,
    record_ref_id: str | None,
    reason_code: str,
    review_note: str | None = None,
    expires_at: datetime | None = None,
) -> RetentionHold:
    if not any((subject_ref, source_id, record_ref_id)):
        raise RightsProblem("RETENTION_HOLD_SCOPE_REQUIRED", "A retention hold must include a subject, source, or record scope.", 422)
    hold = RetentionHold(
        workspace_id=workspace.id,
        subject_ref=subject_ref,
        source_id=source_id,
        record_ref_id=record_ref_id,
        status="ACTIVE",
        reason_code=reason_code,
        review_note=review_note,
        expires_at=expires_at,
    )
    db.add(hold)
    db.flush()
    append_event(
        db,
        workspace.id,
        "RETENTION_HOLD_CREATED",
        {
            "hold_id": hold.id,
            "reason_code": hold.reason_code,
            "subject_ref": hold.subject_ref,
            "source_id": hold.source_id,
            "record_ref_id": hold.record_ref_id,
            "expires_at": iso_utc(hold.expires_at) if hold.expires_at else None,
        },
        entity_type="retention_hold",
        entity_ref=hold.id,
    )
    return hold


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


def _emit_action_event(db: Session, request: RightsRequest, action: RightsRequestAction) -> None:
    payload = {
        "request_id": request.id,
        "action_id": action.id,
        "source_id": action.source_id,
        "action_type": action.action_type,
        "status": action.status,
        "attempt_count": action.attempt_count,
    }
    erased = action.result_json.get("erased_record_count")
    if action.action_type == "ERASURE" and isinstance(erased, int):
        payload["erased_record_count"] = erased
    append_event(
        db,
        request.workspace_id,
        "RIGHTS_ACTION_COMPLETED",
        payload,
        entity_type="rights_request_action",
        entity_ref=action.id,
    )


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
        _emit_action_event(db, request, action)
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
            _emit_action_event(db, request, action)
            return
    if source.configuration_metadata.get("phase4_failure"):
        action.status = "FAILED"
        action.retry_eligible = True
        action.error_code = "SYNTHETIC_CONNECTOR_FAILURE"
        action.error_message = "The synthetic source connector reported a retryable failure."
        action.result_json = {"source_key": source.source_key}
        action.completed_at = now_utc()
        _event(db, job, "ACTION_FAILED", "Synthetic connector failure recorded.", action, {"code": action.error_code})
        _emit_action_event(db, request, action)
        return
    action.status = "RUNNING"
    action.error_code = None
    action.error_message = None
    _event(db, job, "ACTION_STARTED", f"{action.action_type} started for {source.display_name}.", action)
    try:
        if action.action_type == "ACCESS_EXPORT":
            action.result_json = {"source_key": source.source_key, "record_count": len(records), "summary": "Synthetic source access summary compiled."}
        elif action.action_type == "PORTABILITY_EXPORT":
            store = SourceStore(source.id)
            exported = store.read_records([record.source_record_id for record in records])
            action.result_json = {
                "source_key": source.source_key,
                "record_count": len(exported),
                "bundle": {
                    "source_id": source.id,
                    "source_key": source.source_key,
                    "record_count": len(exported),
                    "records": [exported[key] for key in sorted(exported)],
                },
            }
        elif action.action_type == "ERASURE":
            deleted = SourceStore(source.id).delete_records([record.source_record_id for record in records])
            for record in records:
                db.delete(record)
            action.result_json = {"source_key": source.source_key, "planned_record_count": action.affected_record_count, "erased_record_count": deleted}
        elif action.action_type == "RECTIFICATION":
            correction = request.correction_json or {}
            field = str(correction.get("field", ""))
            requested_value = str(correction.get("requested_value", ""))
            store = SourceStore(source.id)
            updated = sum(1 for record in records if store.update_record_field(record.source_record_id, field, requested_value))
            if updated == 0:
                action.status = "FAILED"
                action.retry_eligible = False
                action.error_code = "RECTIFICATION_FIELD_NOT_FOUND"
                action.error_message = "No source record for this subject contains the requested field."
                action.result_json = {"source_key": source.source_key, "field": field, "updated_record_count": 0}
                action.completed_at = now_utc()
                _event(db, job, "ACTION_FAILED", "Rectification could not find the requested field.", action, {"code": action.error_code})
                _emit_action_event(db, request, action)
                return
            action.result_json = {"source_key": source.source_key, "field": field, "updated_record_count": updated}
            from app.demo_projection import invalidate_document_previews, refresh_customer_contact

            invalidate_document_previews(db, {record.dataset_import_id for record in records})
            refresh_customer_contact(db, workspace, request.subject_ref)
            append_event(
                db,
                workspace.id,
                "RECTIFICATION_APPLIED",
                {
                    "request_id": request.id,
                    "action_id": action.id,
                    "source_id": source.id,
                    "field": field,
                    "record_count": updated,
                    "value_sha256": sha256_hex(requested_value),
                },
                entity_type="rights_request_action",
                entity_ref=action.id,
            )
        elif action.action_type == "WITHDRAWAL":
            authorizations = list(db.scalars(select(AuthorizationRecord).where(AuthorizationRecord.workspace_id == workspace.id, AuthorizationRecord.subject_ref == request.subject_ref, AuthorizationRecord.status == "ACTIVE")))
            withdrawn = 0
            suppressions = 0
            for authorization in authorizations:
                authorization.status = "WITHDRAWN"
                authorization.withdrawn_at = now_utc()
                withdrawn += 1
                suppression = db.scalar(select(SuppressionRecord).where(SuppressionRecord.workspace_id == workspace.id, SuppressionRecord.subject_ref == request.subject_ref, SuppressionRecord.purpose == authorization.purpose, SuppressionRecord.channel == authorization.channel, SuppressionRecord.status == "ACTIVE"))
                if suppression is None:
                    suppression = SuppressionRecord(workspace_id=workspace.id, subject_ref=request.subject_ref, purpose=authorization.purpose, channel=authorization.channel, status="ACTIVE", source="rights_workflow", effective_at=now_utc())
                    db.add(suppression)
                    suppressions += 1
                db.flush()
                append_event(
                    db,
                    workspace.id,
                    "AUTHORIZATION_WITHDRAWN",
                    {
                        "subject_ref": request.subject_ref,
                        "authorization_id": authorization.id,
                        "purpose": authorization.purpose,
                        "channel": authorization.channel,
                        "suppression_id": suppression.id,
                        "withdrawn_at": iso_utc(authorization.withdrawn_at),
                    },
                    entity_type="authorization",
                    entity_ref=authorization.id,
                    occurred_at=authorization.withdrawn_at,
                )
            db.flush()
            confirmed = db.scalar(select(func.count(SuppressionRecord.id)).where(SuppressionRecord.workspace_id == workspace.id, SuppressionRecord.subject_ref == request.subject_ref, SuppressionRecord.status == "ACTIVE")) or 0
            action.result_json = {"source_key": source.source_key, "scope": "WORKSPACE_AUTHORIZATIONS", "withdrawn_authorizations": withdrawn, "created_suppressions": suppressions, "confirmed_active_suppressions": confirmed}
        action.status = "SUCCEEDED"
        action.retry_eligible = False
        action.completed_at = now_utc()
        _event(db, job, "ACTION_COMPLETED", f"{action.action_type} completed for {source.display_name}.", action, action.result_json)
        _emit_action_event(db, request, action)
    except Exception as exc:
        action.status = "FAILED"
        action.retry_eligible = True
        action.error_code = "SOURCE_CONNECTOR_ERROR"
        action.error_message = "The source connector could not complete the action."
        action.result_json = {"source_key": source.source_key, "error_class": type(exc).__name__}
        action.completed_at = now_utc()
        _event(db, job, "ACTION_FAILED", "The source connector reported an unexpected failure.", action, {"code": action.error_code})
        _emit_action_event(db, request, action)


def _refresh_artifact(db: Session, request: RightsRequest, actions: list[RightsRequestAction]) -> None:
    if request.request_type not in {"ACCESS", "PORTABILITY"}:
        return
    successful = [action for action in actions if action.status == "SUCCEEDED"]
    if not successful:
        return
    kind = "PORTABILITY_BUNDLE" if request.request_type == "PORTABILITY" else "ACCESS_SUMMARY"
    summaries = [action.result_json for action in successful]
    bundle: dict = {}
    if kind == "PORTABILITY_BUNDLE":
        bundle = {
            "schema": "dvault-portability-v1",
            "request_id": request.id,
            "subject_ref": request.subject_ref,
            "exported_at": iso_utc(now_utc()),
            "sources": [summary.get("bundle", {}) for summary in summaries],
        }
    artifact = db.scalar(select(RightsAccessArtifact).where(RightsAccessArtifact.rights_request_id == request.id))
    if artifact is None:
        artifact = RightsAccessArtifact(rights_request_id=request.id, status="READY" if request.status == "COMPLETE" else "PARTIAL", kind=kind, source_summaries_json=summaries, bundle_json=bundle, expires_at=now_utc() + timedelta(days=7), completed_at=now_utc())
        db.add(artifact)
    else:
        artifact.status = "READY" if request.status == "COMPLETE" else "PARTIAL"
        artifact.kind = kind
        artifact.source_summaries_json = summaries
        artifact.bundle_json = bundle
        artifact.completed_at = now_utc()
    db.flush()
    event_type = "PORTABILITY_BUNDLE_READY" if kind == "PORTABILITY_BUNDLE" else "ACCESS_ARTIFACT_READY"
    append_event(
        db,
        request.workspace_id,
        event_type,
        {
            "request_id": request.id,
            "artifact_id": artifact.id,
            "status": artifact.status,
            "source_keys": sorted({summary.get("source_key") for summary in summaries if summary.get("source_key")}),
        },
        entity_type="rights_access_artifact",
        entity_ref=artifact.id,
    )


def execute_request(db: Session, workspace: Workspace, request: RightsRequest, retry: bool = False) -> Job:
    ensure_evidence_trusted(db, workspace.id, "rights_execution")
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
    _set_request_status(db, request, actions)
    _refresh_artifact(db, request, actions)
    job.action_completed = len([action for action in eligible if action.status == "SUCCEEDED"])
    job.status = request.status
    job.completed_at = now_utc()
    if request.status in {"FAILED", "PARTIAL", "NEEDS_REVIEW"}:
        job.error_code = next((action.error_code for action in actions if action.error_code), None)
        job.error_message = request.summary_json["message"]
    _event(db, job, "JOB_COMPLETED", f"Rights job finished with {request.status}.", details={"request_status": request.status, "action_summary": request.summary_json.get("action_summary", {})})
    return job
