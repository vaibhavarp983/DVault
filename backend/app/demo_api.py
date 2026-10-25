"""Frontend integration façade: persisted snapshot reads and real domain actions."""

from __future__ import annotations

import json
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api import (
    artifact_for_request,
    resolve_breach_row,
    resolve_campaign,
    resolve_rights_request,
    resolve_workspace,
)
from app.breach import assess_breach, close_breach, draft_notification, register_breach
from app.campaigns import create_campaign as create_campaign_service
from app.campaigns import execute_campaign as execute_campaign_service
from app.campaigns import preview_campaign as preview_campaign_service
from app.config import get_settings
from app.db import get_db
from app.demo_failures import DemoProblem, clear_failures, inject_audit_tamper, inject_retention_hold, inject_source_failure, require_failure_controls
from app.demo_projection import (
    CONSENT_CATALOG,
    build_demo_snapshot,
    build_user_workspace,
    ensure_demo_projections,
    resolve_demo_subject,
)
from app.demo_reset import require_demo_controls, reset_workspace
from app.evidence import EvidenceProblem, append_event, create_checkpoint, iso_utc, resolve_integrity_incident, sha256_hex, verify_chain
from app.ingestion import ingest_file
from app.models import (
    AuthorizationRecord,
    DataRecordRef,
    Document,
    IntegrityIncident,
    Job,
    RetentionHold,
    RightsRequest,
    Source,
    SuppressionRecord,
    utc_now,
)
from app.policy import evaluate_marketing
from app.rights import create_hold, create_request, execute_request, plan_request, release_hold
from app.schemas_demo import (
    DemoBreachAssessmentRequest,
    DemoBreachCloseRequest,
    DemoBreachCreateRequest,
    DemoCampaignCreateRequest,
    DemoCheckpointRequest,
    DemoConsentRequest,
    DemoEvaluateRequest,
    DemoFailureRequest,
    DemoHoldCreateRequest,
    DemoHoldReleaseRequest,
    DemoIncidentResolveRequest,
    DemoRightsCreateRequest,
    DemoSnapshotResponse,
    DemoUserRequestCreate,
    DemoUserWorkspaceResponse,
)

router = APIRouter(prefix="/api/v1", tags=["demo"])


def _contact_mode(value: str) -> str:
    mode = (value or "masked").lower()
    if mode not in {"masked", "synthetic"}:
        raise DemoProblem("INVALID_CONTACT_MODE", "contacts must be masked or synthetic.", 422)
    settings = get_settings()
    if mode == "synthetic" and (settings.is_production or not settings.demo_show_synthetic_contacts):
        raise DemoProblem("SYNTHETIC_CONTACTS_DISABLED", "Synthetic contact display is disabled in this environment.", 403)
    return mode


def _snapshot(db: Session, workspace: Workspace, contacts: str) -> DemoSnapshotResponse:
    snapshot = DemoSnapshotResponse(**build_demo_snapshot(db, workspace, _contact_mode(contacts)))
    db.commit()
    return snapshot


def _user(db: Session, workspace: Workspace, contacts: str, subject_ref: str | None = None) -> DemoUserWorkspaceResponse:
    workspace_payload = DemoUserWorkspaceResponse(**build_user_workspace(db, workspace, subject_ref or resolve_demo_subject(db, workspace), _contact_mode(contacts)))
    db.commit()
    return workspace_payload


def _resolve_source(workspace: Workspace, source_id: str, db: Session) -> Source:
    source = db.scalar(select(Source).where(Source.workspace_id == workspace.id, Source.id == source_id))
    if source is None:
        raise DemoProblem("SOURCE_NOT_FOUND", "The selected source was not found.", 404)
    return source


def _resolve_document(workspace: Workspace, document_id: str, db: Session) -> Document:
    document = db.scalar(select(Document).where(Document.workspace_id == workspace.id, Document.id == document_id))
    if document is None:
        raise DemoProblem("DOCUMENT_NOT_FOUND", "The selected document was not found.", 404)
    return document


@router.get("/workspaces/{workspace_ref}/demo", response_model=DemoSnapshotResponse)
def get_demo_snapshot(workspace_ref: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/refresh", response_model=DemoSnapshotResponse)
def refresh_demo_snapshot(workspace_ref: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    ensure_demo_projections(db, workspace)
    verify_chain(db, workspace.id)
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/reset", response_model=DemoSnapshotResponse)
def reset_demo(workspace_ref: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    require_demo_controls()
    workspace = resolve_workspace(workspace_ref, db)
    reset_workspace(db, workspace)
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/imports", response_model=DemoSnapshotResponse, status_code=201)
async def import_demo_file(
    workspace_ref: str,
    source_id: str = Form(...),
    file: UploadFile = File(...),
    contacts: str = Query("masked"),
    db: Session = Depends(get_db),
) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    source = _resolve_source(workspace, source_id, db)
    payload = await file.read()
    ingest_file(db, workspace, source, file.filename or "upload.csv", payload)
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/documents/{document_id}/review", response_model=DemoSnapshotResponse)
def review_document(workspace_ref: str, document_id: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    document = _resolve_document(workspace, document_id, db)
    document.review_status = "REVIEWED"
    document.reviewed_at = utc_now()
    document.confidence = max(document.confidence or 0.0, 0.96)
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/policies/evaluate", response_model=DemoSnapshotResponse)
def evaluate_policy(workspace_ref: str, payload: DemoEvaluateRequest, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    record = db.scalar(select(DataRecordRef).where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.id == payload.recordRefId)) if payload.recordRefId else None
    evaluate_marketing(
        db,
        workspace,
        payload.subjectRef,
        payload.purpose,
        payload.channel,
        record=record,
        correlation_id=f"demo:{uuid4()}",
    )
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/campaigns", response_model=DemoSnapshotResponse, status_code=201)
def create_campaign(workspace_ref: str, payload: DemoCampaignCreateRequest, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    record_ids = payload.recordIds
    if payload.subjectRef and not record_ids and not payload.importId:
        record_ids = list(db.scalars(select(DataRecordRef.id).where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.subject_ref == payload.subjectRef)))
    create_campaign_service(
        db,
        workspace,
        name=payload.name,
        purpose=payload.purpose,
        channel=payload.channel,
        message_template_id=payload.templateId,
        dataset_import_id=payload.importId,
        record_ids=record_ids,
    )
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/campaigns/{campaign_id}/preview", response_model=DemoSnapshotResponse)
def preview_campaign(workspace_ref: str, campaign_id: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    preview_campaign_service(db, workspace, resolve_campaign(workspace, campaign_id, db))
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/campaigns/{campaign_id}/execute", response_model=DemoSnapshotResponse)
def execute_campaign(workspace_ref: str, campaign_id: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    execute_campaign_service(db, workspace, resolve_campaign(workspace, campaign_id, db))
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/rights-requests", response_model=DemoSnapshotResponse, status_code=201)
def create_rights_request(workspace_ref: str, payload: DemoRightsCreateRequest, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    correction = None
    if payload.correction:
        correction = {"field": payload.correction.field, "requested_value": payload.correction.requestedValue, "reason": payload.correction.reason}
    request, _ = create_request(
        db,
        workspace,
        payload.subjectRef,
        payload.requestType,
        f"demo:{uuid4()}",
        payload.requesterReference or "demo_desktop",
        correction,
    )
    plan_request(db, workspace, request)
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/rights-requests/{request_id}/plan", response_model=DemoSnapshotResponse)
def plan_rights_request(workspace_ref: str, request_id: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    plan_request(db, workspace, resolve_rights_request(workspace, request_id, db))
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/rights-requests/{request_id}/execute", response_model=DemoSnapshotResponse)
def execute_rights_request(workspace_ref: str, request_id: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    execute_request(db, workspace, resolve_rights_request(workspace, request_id, db))
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/rights-requests/{request_id}/retry", response_model=DemoSnapshotResponse)
def retry_rights_request(workspace_ref: str, request_id: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    execute_request(db, workspace, resolve_rights_request(workspace, request_id, db), retry=True)
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.get("/workspaces/{workspace_ref}/demo/rights-requests/{request_id}/artifact/download")
def download_artifact(workspace_ref: str, request_id: str, db: Session = Depends(get_db)) -> Response:
    workspace = resolve_workspace(workspace_ref, db)
    request, artifact = artifact_for_request(workspace, request_id, db)
    if artifact.kind != "PORTABILITY_BUNDLE":
        raise DemoProblem("PORTABILITY_BUNDLE_NOT_AVAILABLE", "This request does not have a downloadable portability bundle.", 409)
    payload = json.dumps(artifact.bundle_json or {}, sort_keys=True, indent=2)
    filename = f"{request.reference or request.id}-portability.json"
    return Response(content=payload, media_type="application/json", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/workspaces/{workspace_ref}/demo/retention-holds", response_model=DemoSnapshotResponse, status_code=201)
def create_demo_hold(workspace_ref: str, payload: DemoHoldCreateRequest, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    if payload.sourceId:
        _resolve_source(workspace, payload.sourceId, db)
    create_hold(db, workspace, payload.subjectRef, payload.sourceId, payload.recordRefId, payload.reasonCode, payload.reviewNote, payload.expiresAt)
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/retention-holds/{hold_id}/release", response_model=DemoSnapshotResponse)
def release_demo_hold(workspace_ref: str, hold_id: str, payload: DemoHoldReleaseRequest, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    hold = db.scalar(select(RetentionHold).where(RetentionHold.workspace_id == workspace.id, RetentionHold.id == hold_id))
    if hold is None:
        raise DemoProblem("RETENTION_HOLD_NOT_FOUND", "The retention hold was not found.", 404)
    release_hold(hold, payload.note)
    append_event(
        db,
        workspace.id,
        "RETENTION_HOLD_RELEASED",
        {"hold_id": hold.id, "released_at": iso_utc(hold.released_at), "note_sha256": sha256_hex(payload.note) if payload.note else None},
        entity_type="retention_hold",
        entity_ref=hold.id,
        occurred_at=hold.released_at,
    )
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/jobs/{job_id}/retry", response_model=DemoSnapshotResponse)
def retry_job(workspace_ref: str, job_id: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    job = db.scalar(select(Job).where(Job.workspace_id == workspace.id, Job.id == job_id))
    if job is None or not job.rights_request_id:
        raise DemoProblem("JOB_NOT_RETRYABLE", "Only rights jobs can be retried from this view.", 409)
    request = db.scalar(select(RightsRequest).where(RightsRequest.id == job.rights_request_id))
    execute_request(db, workspace, request, retry=True)
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/audit/verify", response_model=DemoSnapshotResponse)
def verify_demo_audit(workspace_ref: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    verify_chain(db, workspace.id)
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/audit/checkpoints", response_model=DemoSnapshotResponse, status_code=201)
def create_demo_checkpoint(workspace_ref: str, payload: DemoCheckpointRequest, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    try:
        create_checkpoint(db, workspace.id, payload.note)
    except EvidenceProblem:
        db.commit()
        raise
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/integrity-incidents/{incident_id}/resolve", response_model=DemoSnapshotResponse)
def resolve_demo_incident(workspace_ref: str, incident_id: str, payload: DemoIncidentResolveRequest, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    incident = db.scalar(select(IntegrityIncident).where(
        IntegrityIncident.workspace_id == workspace.id,
        IntegrityIncident.id == incident_id,
    ))
    if incident is None:
        raise DemoProblem("INTEGRITY_INCIDENT_NOT_FOUND", "The integrity incident was not found.", 404)
    try:
        resolve_integrity_incident(db, incident, payload.decision, payload.note)
    except EvidenceProblem:
        db.commit()
        raise
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/breaches", response_model=DemoSnapshotResponse, status_code=201)
def create_demo_breach(workspace_ref: str, payload: DemoBreachCreateRequest, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    register_breach(
        db,
        workspace,
        title=payload.title,
        description=payload.description,
        severity=payload.severity.upper(),
        detected_at=payload.detectedAt,
        subject_refs=payload.subjectRefs,
        source_ids=payload.sourceIds,
        containment_summary=payload.containmentSummary,
        created_by_reference="demo_security_center",
    )
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/breaches/{breach_id}/assessment", response_model=DemoSnapshotResponse)
def assess_demo_breach(workspace_ref: str, breach_id: str, payload: DemoBreachAssessmentRequest, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    assess_breach(db, resolve_breach_row(workspace, breach_id, db), payload.notifiable, payload.reasonCode, payload.note)
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/breaches/{breach_id}/notification-draft", response_model=DemoSnapshotResponse)
def draft_demo_breach(workspace_ref: str, breach_id: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    draft_notification(db, resolve_breach_row(workspace, breach_id, db))
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/breaches/{breach_id}/close", response_model=DemoSnapshotResponse)
def close_demo_breach(workspace_ref: str, breach_id: str, payload: DemoBreachCloseRequest, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    workspace = resolve_workspace(workspace_ref, db)
    close_breach(db, resolve_breach_row(workspace, breach_id, db), payload.note)
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/failures", response_model=DemoSnapshotResponse)
def inject_failure(workspace_ref: str, payload: DemoFailureRequest, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    require_failure_controls()
    workspace = resolve_workspace(workspace_ref, db)
    if payload.kind == "source_connector":
        inject_source_failure(db, workspace, payload.targetId)
    elif payload.kind == "retention_hold":
        inject_retention_hold(db, workspace, payload.targetId)
    elif payload.kind == "audit_tamper":
        inject_audit_tamper(db, workspace)
    else:
        raise DemoProblem("DEMO_FAILURE_INVALID", "kind must be source_connector, retention_hold, or audit_tamper.", 422)
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/failures/clear", response_model=DemoSnapshotResponse)
def clear_failure(workspace_ref: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoSnapshotResponse:
    require_failure_controls()
    workspace = resolve_workspace(workspace_ref, db)
    clear_failures(db, workspace)
    db.commit()
    return _snapshot(db, workspace, contacts)


@router.get("/workspaces/{workspace_ref}/demo/user", response_model=DemoUserWorkspaceResponse)
def get_user_workspace(workspace_ref: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoUserWorkspaceResponse:
    workspace = resolve_workspace(workspace_ref, db)
    return _user(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/user/refresh", response_model=DemoUserWorkspaceResponse)
def refresh_user_workspace(workspace_ref: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoUserWorkspaceResponse:
    workspace = resolve_workspace(workspace_ref, db)
    return _user(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/user/reset", response_model=DemoUserWorkspaceResponse)
def reset_user_workspace(workspace_ref: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoUserWorkspaceResponse:
    require_demo_controls()
    workspace = resolve_workspace(workspace_ref, db)
    reset_workspace(db, workspace)
    db.commit()
    return _user(db, workspace, contacts)


@router.post("/workspaces/{workspace_ref}/demo/user/consents/{purpose}", response_model=DemoUserWorkspaceResponse)
def set_user_consent(workspace_ref: str, purpose: str, payload: DemoConsentRequest, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoUserWorkspaceResponse:
    workspace = resolve_workspace(workspace_ref, db)
    subject = resolve_demo_subject(db, workspace)
    catalog = {key: (label, required, description) for key, label, required, description in CONSENT_CATALOG}
    if purpose not in catalog:
        raise DemoProblem("CONSENT_PURPOSE_UNKNOWN", "The consent purpose is not part of this demo.", 404)
    if purpose == "service" and not payload.granted:
        raise DemoProblem("REQUIRED_CONSENT", "The service consent is required and cannot be withdrawn.", 409)
    now = utc_now()
    if payload.granted:
        authorization = db.scalar(select(AuthorizationRecord).where(
            AuthorizationRecord.workspace_id == workspace.id,
            AuthorizationRecord.subject_ref == subject,
            AuthorizationRecord.purpose == purpose,
        ))
        if authorization is None:
            authorization = AuthorizationRecord(
                workspace_id=workspace.id,
                subject_ref=subject,
                purpose=purpose,
                channel="email",
                status="ACTIVE",
                evidence_source="personal_portal",
                notice_version="demo-v1",
                captured_at=now,
            )
            db.add(authorization)
        else:
            authorization.status = "ACTIVE"
            authorization.withdrawn_at = None
            authorization.captured_at = now
        db.flush()
        append_event(
            db,
            workspace.id,
            "AUTHORIZATION_CAPTURED",
            {
                "subject_ref": subject,
                "authorization_id": authorization.id,
                "purpose": purpose,
                "channel": authorization.channel,
                "notice_version": authorization.notice_version,
                "expires_at": iso_utc(authorization.expires_at) if authorization.expires_at else None,
            },
            entity_type="authorization",
            entity_ref=authorization.id,
            occurred_at=now,
        )
    else:
        authorizations = list(db.scalars(select(AuthorizationRecord).where(
            AuthorizationRecord.workspace_id == workspace.id,
            AuthorizationRecord.subject_ref == subject,
            AuthorizationRecord.purpose == purpose,
            AuthorizationRecord.status == "ACTIVE",
        )))
        for authorization in authorizations:
            authorization.status = "WITHDRAWN"
            authorization.withdrawn_at = now
            suppression = db.scalar(select(SuppressionRecord).where(
                SuppressionRecord.workspace_id == workspace.id,
                SuppressionRecord.subject_ref == subject,
                SuppressionRecord.purpose == purpose,
                SuppressionRecord.channel == authorization.channel,
                SuppressionRecord.status == "ACTIVE",
            ))
            if suppression is None:
                suppression = SuppressionRecord(workspace_id=workspace.id, subject_ref=subject, purpose=purpose, channel=authorization.channel, status="ACTIVE", source="personal_portal", effective_at=now)
                db.add(suppression)
                db.flush()
            append_event(
                db,
                workspace.id,
                "AUTHORIZATION_WITHDRAWN",
                {
                    "subject_ref": subject,
                    "authorization_id": authorization.id,
                    "purpose": purpose,
                    "channel": authorization.channel,
                    "suppression_id": suppression.id,
                    "withdrawn_at": iso_utc(now),
                },
                entity_type="authorization",
                entity_ref=authorization.id,
                occurred_at=now,
            )
    db.commit()
    return _user(db, workspace, contacts, subject)


@router.post("/workspaces/{workspace_ref}/demo/user/requests", response_model=DemoUserWorkspaceResponse, status_code=201)
def create_user_request(workspace_ref: str, payload: DemoUserRequestCreate, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoUserWorkspaceResponse:
    workspace = resolve_workspace(workspace_ref, db)
    subject = resolve_demo_subject(db, workspace)
    correction = None
    if payload.correction:
        correction = {"field": payload.correction.field, "requested_value": payload.correction.requestedValue, "reason": payload.correction.reason}
    request, _ = create_request(db, workspace, subject, payload.type, f"portal:{uuid4()}", "personal_portal", correction)
    plan_request(db, workspace, request)
    db.commit()
    return _user(db, workspace, contacts, subject)


@router.post("/workspaces/{workspace_ref}/demo/user/requests/{request_id}/retry", response_model=DemoUserWorkspaceResponse)
def retry_user_request(workspace_ref: str, request_id: str, contacts: str = Query("masked"), db: Session = Depends(get_db)) -> DemoUserWorkspaceResponse:
    workspace = resolve_workspace(workspace_ref, db)
    subject = resolve_demo_subject(db, workspace)
    request = db.scalar(select(RightsRequest).where(RightsRequest.workspace_id == workspace.id, RightsRequest.id == request_id, RightsRequest.subject_ref == subject))
    if request is None:
        raise DemoProblem("RIGHTS_REQUEST_NOT_FOUND", "The request was not found for this demo subject.", 404)
    execute_request(db, workspace, request, retry=True)
    db.commit()
    return _user(db, workspace, contacts, subject)
