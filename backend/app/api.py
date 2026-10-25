import json
from typing import Any

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy import func, inspect, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.campaigns import (
    create_campaign as create_campaign_service,
    execute_campaign as execute_campaign_service,
    preview_campaign as preview_campaign_service,
)
from app.breach import (
    DISCLAIMER as BREACH_DISCLAIMER,
    affected_counts,
    assess_breach,
    assessment_status,
    breach_affected,
    breach_timer_state,
    close_breach,
    draft_notification,
    register_breach,
)
from app.config import get_settings
from app.db import engine, get_db
from app.evidence import (
    DISCLAIMER as EVIDENCE_DISCLAIMER,
    EvidenceProblem,
    append_event,
    audit_status,
    create_checkpoint,
    ensure_evidence_trusted,
    evidence_gate,
    iso_utc,
    resolve_integrity_incident,
    sha256_hex,
    trusted_through_sequence,
    verify_chain,
)
from app.ingestion import IngestionProblem, ingest_file, mask_value, normalize_field
from app.models import (
    AuditCheckpoint, AuditEvent, AuthorizationRecord, BreachAffectedSource, BreachAffectedSubject,
    BreachIncident, Campaign, CampaignRecipient, DataQualityFinding, DataRecordRef, DatasetImport, Document,
    DocumentExtraction, FixtureManifest, ImportFieldProfile, IntegrityIncident, Job, JobEvent, MatchCandidate,
    MockOutbox, Policy, RetentionHold, RightsAccessArtifact, RightsRequest, RightsRequestAction, Source, PolicyDecision,
    SuppressionRecord, Workspace,
)
from app.policy import PolicyProblem, ensure_default_policy, evaluate_marketing, masked_subject_ref
from app.rights import (
    RightsProblem,
    create_hold as create_hold_service,
    create_request as create_rights_request,
    execute_request,
    plan_request,
    release_hold,
    request_actions,
)
from app.schemas import (
    AccessArtifactResponse,
    AuditCheckpointCreateRequest, AuditCheckpointResponse, AuditCheckpointStatus, AuditChainSummary,
    AuditEventPageResponse, AuditEventResponse, AuditFailureResponse, AuditStatusResponse, AuditVerificationSummary,
    AuditVerifyRequest, AuditVerifyResponse,
    AuthorizationCreateRequest, AuthorizationResponse, BreachAffectedResponse, BreachAffectedSourceResponse,
    BreachAffectedSubjectResponse, BreachAssessmentRequest, BreachCloseRequest, BreachCreateRequest, BreachDetailResponse,
    BreachNotificationDraftResponse, BreachPageResponse, BreachResponse,
    CampaignCreateRequest, CampaignRecipientPageResponse,
    CampaignRecipientResponse, CampaignResponse,
    DashboardResponse, DataQualityFindingResponse, DataQualityPageResponse, DocumentExtractionResponse, DocumentResponse,
    EvidenceGateSummary, FailureInjectionRequest, FailureInjectionResponse,
    FieldProfileResponse, HealthResponse, ImportPageResponse, ImportResponse, IntegrityIncidentResolveRequest,
    IntegrityIncidentResponse, MatchCandidatePageResponse,
    MatchCandidateResponse, OutboxPageResponse, OutboxResponse, PageResponse, PolicyDecisionResponse,
    PolicyEvaluationRequest, PolicyResponse, RecordPageResponse, RecordResponse, SchemaPreviewResponse,
    SourceResponse, WithdrawalRequest, WorkspaceResponse, JobDetailResponse, JobEventResponse, JobPageResponse,
    JobResponse, RetentionHoldCreateRequest, RetentionHoldReleaseRequest, RetentionHoldResponse,
    RightsActionPageResponse, RightsActionResponse,
    RightsRequestCreateRequest, RightsRequestPageResponse, RightsRequestResponse,
)
from app.source_store import SourceStore

router = APIRouter(prefix="/api/v1")
REQUIRED_TABLES = {"workspaces", "sources", "documents", "fixture_manifests", "api_contract_versions", "dataset_imports", "import_field_profiles", "data_record_refs", "identity_tokens", "match_candidates", "data_quality_findings", "document_extractions", "policies", "authorization_records", "suppression_records", "policy_decisions", "campaigns", "campaign_recipients", "mock_outbox", "rights_requests", "rights_request_actions", "retention_holds", "rights_access_artifacts", "jobs", "job_events", "audit_events", "audit_checkpoints", "audit_verifications", "integrity_incidents", "breach_incidents", "breach_affected_subjects", "breach_affected_sources", "conversations", "conversation_messages", "retention_policies", "retention_runs", "withdrawal_tiers", "alembic_version"}


class NotFoundError(Exception):
    def __init__(self, resource: str) -> None:
        self.resource = resource


class ServiceUnavailableError(Exception):
    def __init__(self, message: str) -> None:
        self.message = message


class ConflictError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message


class ForbiddenError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message


def resolve_workspace(workspace_ref: str, db: Session) -> Workspace:
    query = select(Workspace)
    if workspace_ref == "default":
        workspace = db.scalar(query.where(Workspace.slug == "aranya-coaching-centre"))
    else:
        workspace = db.scalar(query.where((Workspace.slug == workspace_ref) | (Workspace.id == workspace_ref)))
    if workspace is None:
        raise NotFoundError("workspace")
    return workspace


def document_response(document: Document) -> DocumentResponse:
    return DocumentResponse(
        id=document.id,
        source_id=document.source_id,
        document_key=document.document_key,
        synthetic_label=document.synthetic_label,
        document_type=document.document_type,
        filename=document.filename,
        mime_type=document.mime_type,
        preview_reference=document.source_path,
        display_title=document.display_title,
        document_created_at=document.document_created_at,
        processing_status=document.processing_status,
        metadata=document.metadata_json,
    )


def import_response(import_row: DatasetImport, reused: bool = False) -> ImportResponse:
    return ImportResponse(
        id=import_row.id, source_id=import_row.source_id, document_id=import_row.document_id, filename=import_row.filename,
        content_type=import_row.content_type, byte_size=import_row.byte_size, content_sha256=import_row.content_sha256,
        status=import_row.status, row_count=import_row.row_count, error_code=import_row.error_code,
        error_message=import_row.error_message, created_at=import_row.created_at, completed_at=import_row.completed_at,
        idempotent_reuse=reused,
    )


def record_response(record: DataRecordRef) -> RecordResponse:
    raw = SourceStore(record.source_id).read_record(record.source_record_id) or {}
    preview: dict[str, str] = {}
    for field, value in raw.items():
        if value is None:
            continue
        metadata = record.field_metadata_json.get(normalize_field(field), {})
        preview[normalize_field(field)] = mask_value(str(value), metadata.get("classification", "UNKNOWN"))
    return RecordResponse(
        id=record.id, source_id=record.source_id, dataset_import_id=record.dataset_import_id, subject_ref=record.subject_ref,
        record_type=record.record_type, match_status=record.match_status, field_metadata=record.field_metadata_json,
        masked_preview=preview, created_at=record.created_at,
    )


def authorization_response(item: AuthorizationRecord) -> AuthorizationResponse:
    return AuthorizationResponse(
        id=item.id, subject_ref=item.subject_ref, purpose=item.purpose, channel=item.channel, status=item.status,
        evidence_document_id=item.evidence_document_id, evidence_source=item.evidence_source, notice_version=item.notice_version,
        captured_at=item.captured_at, expires_at=item.expires_at, withdrawn_at=item.withdrawn_at,
    )


def campaign_response(db: Session, campaign: Campaign) -> CampaignResponse:
    recipients = list(db.scalars(select(CampaignRecipient).where(CampaignRecipient.campaign_id == campaign.id)))
    summary: dict[str, int] = {}
    for recipient in recipients:
        decision = recipient.execution_decision or recipient.preview_decision
        if decision:
            summary[decision] = summary.get(decision, 0) + 1
    return CampaignResponse(
        id=campaign.id, name=campaign.name, purpose=campaign.purpose, channel=campaign.channel,
        message_template_id=campaign.message_template_id, dataset_import_id=campaign.dataset_import_id, status=campaign.status,
        synthetic_label=campaign.synthetic_label, created_at=campaign.created_at, previewed_at=campaign.previewed_at,
        executed_at=campaign.executed_at, recipient_total=len(recipients), decision_summary=summary,
    )


def recipient_response(item: CampaignRecipient) -> CampaignRecipientResponse:
    return CampaignRecipientResponse(
        id=item.id, record_ref_id=item.record_ref_id, subject_ref=item.subject_ref, preview_decision=item.preview_decision,
        preview_reason_codes=item.preview_reason_codes_json, previewed_at=item.previewed_at,
        execution_decision=item.execution_decision, execution_reason_codes=item.execution_reason_codes_json,
        executed_at=item.executed_at,
    )


def decision_response(result) -> PolicyDecisionResponse:
    return PolicyDecisionResponse(decision=result.decision, reason_codes=result.reason_codes, evaluated_rules=result.evaluated_rules, policy_id=result.policy_id, policy_version=result.policy_version, correlation_id=result.correlation_id, evaluated_at=result.evaluated_at)


def rights_request_response(db: Session, item: RightsRequest) -> RightsRequestResponse:
    actions = request_actions(db, item.id)
    completed = len([action for action in actions if action.status == "SUCCEEDED"])
    return RightsRequestResponse(
        id=item.id, subject_ref=item.subject_ref, request_type=item.request_type, status=item.status,
        idempotency_key=item.idempotency_key, correlation_id=item.correlation_id,
        requester_reference=item.requester_reference, summary=item.summary_json, reference=item.reference,
        due_at=item.due_at, correction_field=(item.correction_json or {}).get("field"), created_at=item.created_at,
        planned_at=item.planned_at, completed_at=item.completed_at, updated_at=item.updated_at,
        source_action_total=len(actions), source_action_completed=completed, unresolved_action_total=len(actions) - completed,
    )


def rights_action_response(item: RightsRequestAction) -> RightsActionResponse:
    return RightsActionResponse(
        id=item.id, source_id=item.source_id, action_type=item.action_type, status=item.status,
        attempt_count=item.attempt_count, retry_eligible=item.retry_eligible,
        affected_record_count=item.affected_record_count, result=item.result_json,
        error_code=item.error_code, error_message=item.error_message, planned_at=item.planned_at,
        started_at=item.started_at, completed_at=item.completed_at, updated_at=item.updated_at,
    )


def job_response(item: Job) -> JobResponse:
    return JobResponse(
        id=item.id, rights_request_id=item.rights_request_id, operation=item.operation, status=item.status,
        attempt_count=item.attempt_count, action_total=item.action_total, action_completed=item.action_completed,
        error_code=item.error_code, error_message=item.error_message, correlation_id=item.correlation_id,
        created_at=item.created_at, started_at=item.started_at, completed_at=item.completed_at,
    )


def hold_response(item: RetentionHold) -> RetentionHoldResponse:
    return RetentionHoldResponse(
        id=item.id, subject_ref=item.subject_ref, source_id=item.source_id, record_ref_id=item.record_ref_id,
        status=item.status, reason_code=item.reason_code, review_note=item.review_note,
        expires_at=item.expires_at, released_at=item.released_at, created_at=item.created_at,
    )


def audit_event_response(event: AuditEvent, trusted_through: int | None) -> AuditEventResponse:
    try:
        payload = json.loads(event.canonical_payload)
    except (TypeError, ValueError):
        payload = {"malformed": True}
    if trusted_through is None:
        trust = "UNVERIFIED"
    else:
        trust = "TRUSTED" if event.sequence <= trusted_through else "UNTRUSTED"
    return AuditEventResponse(
        id=event.id, sequence=event.sequence, event_type=event.event_type, entity_type=event.entity_type,
        entity_ref=event.entity_ref, payload=payload, payload_sha256=event.payload_sha256,
        previous_hash=event.previous_hash, event_hash=event.event_hash, occurred_at=event.occurred_at,
        recorded_at=event.recorded_at, actor_reference=event.actor_reference, trust_state=trust,
    )


def audit_checkpoint_response(checkpoint: AuditCheckpoint) -> AuditCheckpointResponse:
    return AuditCheckpointResponse(
        id=checkpoint.id, sequence=checkpoint.sequence, head_hash=checkpoint.head_hash,
        signature=checkpoint.signature, public_key=checkpoint.public_key, key_id=checkpoint.key_id,
        algorithm=checkpoint.algorithm, note=checkpoint.note, created_at=checkpoint.created_at,
    )


def incident_response(incident: IntegrityIncident) -> IntegrityIncidentResponse:
    return IntegrityIncidentResponse(
        id=incident.id, status=incident.status, first_failure_sequence=incident.first_failure_sequence,
        reason_code=incident.reason_code, reason_message=incident.reason_message,
        verification_id=incident.verification_id, linked_breach_incident_id=incident.linked_breach_incident_id,
        detected_at=incident.detected_at, last_detected_at=incident.last_detected_at,
        acknowledged_at=incident.acknowledged_at, resolved_at=incident.resolved_at,
        resolution_decision=incident.resolution_decision, resolution_note=incident.resolution_note,
    )


def breach_response(db: Session, breach: BreachIncident) -> BreachResponse:
    subject_total, source_total = affected_counts(db, breach.id)
    return BreachResponse(
        id=breach.id, incident_ref=breach.incident_ref, title=breach.title, description=breach.description,
        origin=breach.origin, origin_ref=breach.origin_ref, severity=breach.severity, status=breach.status,
        scope_status=breach.scope_status, detected_at=breach.detected_at, assessment_due_at=breach.assessment_due_at,
        assessed_at=breach.assessed_at, notifiable=breach.notifiable, assessment_reason_code=breach.assessment_reason_code,
        assessment_note=breach.assessment_note, assessment_timeliness=breach.assessment_timeliness,
        timer_state=breach_timer_state(breach), assessment_status=assessment_status(breach),
        notification_status=breach.notification_status, notification_drafted_at=breach.notification_drafted_at,
        notification_subject=breach.notification_subject, containment_summary=breach.containment_summary,
        close_note=breach.close_note, linked_integrity_incident_id=breach.linked_integrity_incident_id,
        created_by_reference=breach.created_by_reference, created_at=breach.created_at, updated_at=breach.updated_at,
        closed_at=breach.closed_at, affected_subject_total=subject_total, affected_source_total=source_total,
    )


def breach_detail_response(db: Session, breach: BreachIncident) -> BreachDetailResponse:
    base = breach_response(db, breach)
    affected = breach_affected(db, breach)
    notification = None
    if breach.notification_status == "DRAFTED":
        notification = BreachNotificationDraftResponse(
            status="DRAFT", subject=breach.notification_subject, body=breach.notification_body,
            generated_at=breach.notification_drafted_at,
            disclaimer=BREACH_DISCLAIMER,
        )
    return BreachDetailResponse(
        **base.model_dump(),
        notification=notification,
        affected=BreachAffectedResponse(**affected),
    )


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health(db: Session = Depends(get_db)) -> HealthResponse:
    try:
        get_settings().validate_runtime()
        table_names = set(inspect(engine).get_table_names())
        if not REQUIRED_TABLES.issubset(table_names):
            raise ServiceUnavailableError("Database migrations have not been applied.")
        active_manifest = db.scalar(select(FixtureManifest).where(FixtureManifest.is_active.is_(True)))
        if active_manifest is None:
            raise ServiceUnavailableError("The synthetic fixture manifest has not been seeded.")
        return HealthResponse(status="ok", database="ready", migrations="current", fixture_manifest="ready")
    except (SQLAlchemyError, RuntimeError) as exc:
        raise ServiceUnavailableError("The database is unavailable.") from exc


@router.get("/workspaces/{workspace_ref}", response_model=WorkspaceResponse, tags=["workspaces"])
def get_workspace(workspace_ref: str, db: Session = Depends(get_db)) -> Workspace:
    return resolve_workspace(workspace_ref, db)


@router.get("/workspaces/{workspace_ref}/sources", response_model=list[SourceResponse], tags=["sources"])
def list_sources(workspace_ref: str, db: Session = Depends(get_db)) -> list[Source]:
    workspace = resolve_workspace(workspace_ref, db)
    return list(db.scalars(select(Source).where(Source.workspace_id == workspace.id).order_by(Source.display_name)))


@router.get("/workspaces/{workspace_ref}/sources/{source_id}", response_model=SourceResponse, tags=["sources"])
def get_source(workspace_ref: str, source_id: str, db: Session = Depends(get_db)) -> Source:
    workspace = resolve_workspace(workspace_ref, db)
    source = db.scalar(select(Source).where(Source.workspace_id == workspace.id, Source.id == source_id))
    if source is None:
        raise NotFoundError("source")
    return source


@router.post("/workspaces/{workspace_ref}/sources/{source_id}/failure-injection", response_model=FailureInjectionResponse, tags=["sources"])
def set_failure_injection(workspace_ref: str, source_id: str, payload: FailureInjectionRequest, db: Session = Depends(get_db)) -> FailureInjectionResponse:
    """Development-only hook for rehearsing a connector failure. Disabled by default."""
    settings = get_settings()
    if settings.is_production or not settings.enable_failure_injection:
        raise ForbiddenError("FAILURE_INJECTION_DISABLED", "Synthetic connector failure injection is disabled.")
    workspace = resolve_workspace(workspace_ref, db)
    source = db.scalar(select(Source).where(Source.workspace_id == workspace.id, Source.id == source_id))
    if source is None:
        raise NotFoundError("source")
    source.configuration_metadata = {**(source.configuration_metadata or {}), "phase4_failure": payload.enabled}
    db.commit()
    db.refresh(source)
    return FailureInjectionResponse(source_id=source.id, source_key=source.source_key, failure_injection_enabled=payload.enabled, scope="development-test-hook")


@router.get("/workspaces/{workspace_ref}/policies", response_model=list[PolicyResponse], tags=["policy"])
def list_policies(workspace_ref: str, db: Session = Depends(get_db)) -> list[PolicyResponse]:
    workspace = resolve_workspace(workspace_ref, db)
    return [PolicyResponse(id=item.id, policy_key=item.policy_key, version=item.version, name=item.name, status=item.status, effective_at=item.effective_at, rules=item.rules_json, synthetic_label=item.synthetic_label) for item in db.scalars(select(Policy).where(Policy.workspace_id == workspace.id).order_by(Policy.policy_key, Policy.version.desc()))]


@router.get("/workspaces/{workspace_ref}/policies/{policy_id}", response_model=PolicyResponse, tags=["policy"])
def get_policy(workspace_ref: str, policy_id: str, db: Session = Depends(get_db)) -> PolicyResponse:
    workspace = resolve_workspace(workspace_ref, db)
    item = db.scalar(select(Policy).where(Policy.workspace_id == workspace.id, Policy.id == policy_id))
    if item is None:
        raise NotFoundError("policy")
    return PolicyResponse(id=item.id, policy_key=item.policy_key, version=item.version, name=item.name, status=item.status, effective_at=item.effective_at, rules=item.rules_json, synthetic_label=item.synthetic_label)


@router.post("/workspaces/{workspace_ref}/policy-decisions/evaluate", response_model=PolicyDecisionResponse, tags=["policy"])
def evaluate_policy(workspace_ref: str, payload: PolicyEvaluationRequest, db: Session = Depends(get_db)) -> PolicyDecisionResponse:
    workspace = resolve_workspace(workspace_ref, db)
    result = evaluate_marketing(db, workspace, payload.subject_ref, payload.purpose, payload.channel, payload.operation)
    db.commit()
    return decision_response(result)


def validate_subject(workspace: Workspace, subject_ref: str, db: Session) -> None:
    known = db.scalar(select(DataRecordRef.id).where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.subject_ref == subject_ref))
    if known is None:
        raise PolicyProblem("SUBJECT_REFERENCE_UNKNOWN", "subject_ref must resolve to an inventoried record")


@router.post("/workspaces/{workspace_ref}/authorizations", response_model=AuthorizationResponse, status_code=201, tags=["policy"])
def capture_authorization(workspace_ref: str, payload: AuthorizationCreateRequest, db: Session = Depends(get_db)) -> AuthorizationResponse:
    workspace = resolve_workspace(workspace_ref, db)
    validate_subject(workspace, payload.subject_ref, db)
    if payload.evidence_document_id and db.scalar(select(Document.id).where(Document.workspace_id == workspace.id, Document.id == payload.evidence_document_id)) is None:
        raise NotFoundError("document")
    if payload.expires_at is not None and payload.expires_at <= payload.captured_at:
        raise PolicyProblem("INVALID_AUTHORIZATION_EXPIRY", "expires_at must be later than captured_at")
    item = AuthorizationRecord(workspace_id=workspace.id, subject_ref=payload.subject_ref, purpose=payload.purpose, channel=payload.channel, status="ACTIVE", evidence_document_id=payload.evidence_document_id, evidence_source=payload.evidence_source, notice_version=payload.notice_version, captured_at=payload.captured_at, expires_at=payload.expires_at)
    db.add(item)
    db.flush()
    append_event(
        db,
        workspace.id,
        "AUTHORIZATION_CAPTURED",
        {
            "subject_ref": item.subject_ref,
            "authorization_id": item.id,
            "purpose": item.purpose,
            "channel": item.channel,
            "notice_version": item.notice_version,
            "expires_at": iso_utc(item.expires_at) if item.expires_at else None,
        },
        entity_type="authorization",
        entity_ref=item.id,
        occurred_at=item.captured_at,
    )
    db.commit()
    db.refresh(item)
    return authorization_response(item)


@router.get("/workspaces/{workspace_ref}/authorizations", response_model=list[AuthorizationResponse], tags=["policy"])
def list_authorizations(workspace_ref: str, subject_ref: str | None = None, purpose: str | None = None, channel: str | None = None, status: str | None = None, db: Session = Depends(get_db)) -> list[AuthorizationResponse]:
    workspace = resolve_workspace(workspace_ref, db)
    filters = [AuthorizationRecord.workspace_id == workspace.id]
    for column, value in ((AuthorizationRecord.subject_ref, subject_ref), (AuthorizationRecord.purpose, purpose), (AuthorizationRecord.channel, channel), (AuthorizationRecord.status, status)):
        if value:
            filters.append(column == value)
    return [authorization_response(item) for item in db.scalars(select(AuthorizationRecord).where(*filters).order_by(AuthorizationRecord.created_at.desc()))]


@router.post("/workspaces/{workspace_ref}/authorizations/{authorization_id}/withdraw", response_model=AuthorizationResponse, tags=["policy"])
def withdraw_authorization(workspace_ref: str, authorization_id: str, payload: WithdrawalRequest, db: Session = Depends(get_db)) -> AuthorizationResponse:
    workspace = resolve_workspace(workspace_ref, db)
    item = db.scalar(select(AuthorizationRecord).where(AuthorizationRecord.workspace_id == workspace.id, AuthorizationRecord.id == authorization_id))
    if item is None:
        raise NotFoundError("authorization")
    if item.status != "WITHDRAWN":
        now = datetime.now(timezone.utc)
        item.status = "WITHDRAWN"
        item.withdrawn_at = now
        suppression = SuppressionRecord(workspace_id=workspace.id, subject_ref=item.subject_ref, purpose=item.purpose, channel=item.channel, status="ACTIVE", source=payload.source, effective_at=now)
        db.add(suppression)
        db.flush()
        append_event(
            db,
            workspace.id,
            "AUTHORIZATION_WITHDRAWN",
            {
                "subject_ref": item.subject_ref,
                "authorization_id": item.id,
                "purpose": item.purpose,
                "channel": item.channel,
                "suppression_id": suppression.id,
                "withdrawn_at": iso_utc(now),
            },
            entity_type="authorization",
            entity_ref=item.id,
            occurred_at=now,
        )
        db.commit()
    db.refresh(item)
    return authorization_response(item)


def resolve_rights_request(workspace: Workspace, request_id: str, db: Session) -> RightsRequest:
    item = db.scalar(select(RightsRequest).where(RightsRequest.workspace_id == workspace.id, RightsRequest.id == request_id))
    if item is None:
        raise NotFoundError("rights_request")
    return item


@router.post("/workspaces/{workspace_ref}/rights-requests", response_model=RightsRequestResponse, status_code=201, tags=["rights"])
def create_rights_request_endpoint(workspace_ref: str, payload: RightsRequestCreateRequest, response: Response, db: Session = Depends(get_db)) -> RightsRequestResponse:
    workspace = resolve_workspace(workspace_ref, db)
    request, reused = create_rights_request(
        db,
        workspace,
        payload.subject_ref,
        payload.request_type,
        payload.idempotency_key,
        payload.requester_reference,
        payload.correction.model_dump() if payload.correction else None,
    )
    db.commit()
    db.refresh(request)
    if reused:
        response.status_code = 200
    return rights_request_response(db, request)


@router.get("/workspaces/{workspace_ref}/rights-requests", response_model=RightsRequestPageResponse, tags=["rights"])
def list_rights_requests(workspace_ref: str, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), status: str | None = None, request_type: str | None = None, db: Session = Depends(get_db)) -> RightsRequestPageResponse:
    workspace = resolve_workspace(workspace_ref, db)
    filters = [RightsRequest.workspace_id == workspace.id]
    if status:
        filters.append(RightsRequest.status == status)
    if request_type:
        filters.append(RightsRequest.request_type == request_type.upper())
    total = db.scalar(select(func.count(RightsRequest.id)).where(*filters)) or 0
    rows = db.scalars(select(RightsRequest).where(*filters).order_by(RightsRequest.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    return RightsRequestPageResponse(items=[rights_request_response(db, item) for item in rows], page=page, page_size=page_size, total=total)


@router.get("/workspaces/{workspace_ref}/rights-requests/{request_id}", response_model=RightsRequestResponse, tags=["rights"])
def get_rights_request(workspace_ref: str, request_id: str, db: Session = Depends(get_db)) -> RightsRequestResponse:
    workspace = resolve_workspace(workspace_ref, db)
    return rights_request_response(db, resolve_rights_request(workspace, request_id, db))


@router.post("/workspaces/{workspace_ref}/rights-requests/{request_id}/plan", response_model=RightsRequestResponse, tags=["rights"])
def plan_rights_request(workspace_ref: str, request_id: str, db: Session = Depends(get_db)) -> RightsRequestResponse:
    workspace = resolve_workspace(workspace_ref, db)
    request = plan_request(db, workspace, resolve_rights_request(workspace, request_id, db))
    db.commit()
    db.refresh(request)
    return rights_request_response(db, request)


@router.post("/workspaces/{workspace_ref}/rights-requests/{request_id}/execute", response_model=JobResponse, tags=["rights"])
def execute_rights_request(workspace_ref: str, request_id: str, db: Session = Depends(get_db)) -> JobResponse:
    workspace = resolve_workspace(workspace_ref, db)
    job = execute_request(db, workspace, resolve_rights_request(workspace, request_id, db))
    db.commit()
    db.refresh(job)
    return job_response(job)


@router.post("/workspaces/{workspace_ref}/rights-requests/{request_id}/retry", response_model=JobResponse, tags=["rights"])
def retry_rights_request(workspace_ref: str, request_id: str, db: Session = Depends(get_db)) -> JobResponse:
    workspace = resolve_workspace(workspace_ref, db)
    job = execute_request(db, workspace, resolve_rights_request(workspace, request_id, db), retry=True)
    db.commit()
    db.refresh(job)
    return job_response(job)


@router.get("/workspaces/{workspace_ref}/rights-requests/{request_id}/actions", response_model=RightsActionPageResponse, tags=["rights"])
def list_rights_actions(workspace_ref: str, request_id: str, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db)) -> RightsActionPageResponse:
    workspace = resolve_workspace(workspace_ref, db)
    request = resolve_rights_request(workspace, request_id, db)
    actions = request_actions(db, request.id)
    total = len(actions)
    window = actions[(page - 1) * page_size: page * page_size]
    return RightsActionPageResponse(items=[rights_action_response(action) for action in window], page=page, page_size=page_size, total=total)


def artifact_response(artifact: RightsAccessArtifact) -> AccessArtifactResponse:
    return AccessArtifactResponse(
        id=artifact.id, rights_request_id=artifact.rights_request_id, status=artifact.status, kind=artifact.kind,
        source_summaries=artifact.source_summaries_json, bundle=artifact.bundle_json or {},
        expires_at=artifact.expires_at, created_at=artifact.created_at, completed_at=artifact.completed_at,
    )


def artifact_for_request(workspace: Workspace, request_id: str, db: Session) -> tuple[RightsRequest, RightsAccessArtifact]:
    request = resolve_rights_request(workspace, request_id, db)
    artifact = db.scalar(select(RightsAccessArtifact).where(RightsAccessArtifact.rights_request_id == request.id))
    if artifact is None:
        raise NotFoundError("rights_access_artifact")
    return request, artifact


@router.get("/workspaces/{workspace_ref}/rights-requests/{request_id}/access-artifact", response_model=AccessArtifactResponse, tags=["rights"])
def get_access_artifact(workspace_ref: str, request_id: str, db: Session = Depends(get_db)) -> AccessArtifactResponse:
    workspace = resolve_workspace(workspace_ref, db)
    _, artifact = artifact_for_request(workspace, request_id, db)
    return artifact_response(artifact)


@router.get("/workspaces/{workspace_ref}/rights-requests/{request_id}/artifact", response_model=AccessArtifactResponse, tags=["rights"])
def get_rights_artifact(workspace_ref: str, request_id: str, db: Session = Depends(get_db)) -> AccessArtifactResponse:
    workspace = resolve_workspace(workspace_ref, db)
    _, artifact = artifact_for_request(workspace, request_id, db)
    return artifact_response(artifact)


@router.get("/workspaces/{workspace_ref}/rights-requests/{request_id}/artifact/download", tags=["rights"])
def download_rights_artifact(workspace_ref: str, request_id: str, db: Session = Depends(get_db)) -> Response:
    workspace = resolve_workspace(workspace_ref, db)
    request, artifact = artifact_for_request(workspace, request_id, db)
    if artifact.kind != "PORTABILITY_BUNDLE":
        raise RightsProblem("PORTABILITY_BUNDLE_NOT_AVAILABLE", "This request does not have a downloadable portability bundle.", 409)
    payload = json.dumps(artifact.bundle_json, sort_keys=True, indent=2)
    filename = f"{request.reference or request.id}-portability.json"
    return Response(
        content=payload,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/workspaces/{workspace_ref}/retention-holds", response_model=RetentionHoldResponse, status_code=201, tags=["rights"])
def create_retention_hold(workspace_ref: str, payload: RetentionHoldCreateRequest, db: Session = Depends(get_db)) -> RetentionHoldResponse:
    workspace = resolve_workspace(workspace_ref, db)
    if not any((payload.subject_ref, payload.source_id, payload.record_ref_id)):
        raise RightsProblem("RETENTION_HOLD_SCOPE_REQUIRED", "A retention hold must include a subject, source, or record scope.", 422)
    if payload.source_id and db.scalar(select(Source.id).where(Source.workspace_id == workspace.id, Source.id == payload.source_id)) is None:
        raise NotFoundError("source")
    if payload.record_ref_id and db.scalar(select(DataRecordRef.id).where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.id == payload.record_ref_id)) is None:
        raise NotFoundError("record")
    hold = create_hold_service(
        db,
        workspace,
        payload.subject_ref,
        payload.source_id,
        payload.record_ref_id,
        payload.reason_code,
        payload.review_note,
        payload.expires_at,
    )
    db.commit()
    db.refresh(hold)
    return hold_response(hold)


@router.get("/workspaces/{workspace_ref}/retention-holds", response_model=list[RetentionHoldResponse], tags=["rights"])
def list_retention_holds(workspace_ref: str, subject_ref: str | None = None, status: str | None = None, db: Session = Depends(get_db)) -> list[RetentionHoldResponse]:
    workspace = resolve_workspace(workspace_ref, db)
    filters = [RetentionHold.workspace_id == workspace.id]
    if subject_ref:
        filters.append(RetentionHold.subject_ref == subject_ref)
    if status:
        filters.append(RetentionHold.status == status)
    return [hold_response(hold) for hold in db.scalars(select(RetentionHold).where(*filters).order_by(RetentionHold.created_at.desc()))]


@router.post("/workspaces/{workspace_ref}/retention-holds/{hold_id}/release", response_model=RetentionHoldResponse, tags=["rights"])
def release_retention_hold(workspace_ref: str, hold_id: str, payload: RetentionHoldReleaseRequest, db: Session = Depends(get_db)) -> RetentionHoldResponse:
    workspace = resolve_workspace(workspace_ref, db)
    hold = db.scalar(select(RetentionHold).where(RetentionHold.workspace_id == workspace.id, RetentionHold.id == hold_id))
    if hold is None:
        raise NotFoundError("retention_hold")
    release_hold(hold, payload.note)
    released_at = hold.released_at
    append_event(
        db,
        workspace.id,
        "RETENTION_HOLD_RELEASED",
        {
            "hold_id": hold.id,
            "released_at": iso_utc(released_at),
            **({"note_sha256": sha256_hex(payload.note)} if payload.note else {}),
        },
        entity_type="retention_hold",
        entity_ref=hold.id,
        occurred_at=released_at,
    )
    db.commit()
    db.refresh(hold)
    return hold_response(hold)


@router.get("/workspaces/{workspace_ref}/jobs", response_model=JobPageResponse, tags=["jobs"])
def list_jobs(workspace_ref: str, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), status: str | None = None, db: Session = Depends(get_db)) -> JobPageResponse:
    workspace = resolve_workspace(workspace_ref, db)
    filters = [Job.workspace_id == workspace.id]
    if status:
        filters.append(Job.status == status)
    total = db.scalar(select(func.count(Job.id)).where(*filters)) or 0
    rows = db.scalars(select(Job).where(*filters).order_by(Job.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    return JobPageResponse(items=[job_response(job) for job in rows], page=page, page_size=page_size, total=total)


@router.get("/workspaces/{workspace_ref}/jobs/{job_id}", response_model=JobDetailResponse, tags=["jobs"])
def get_job(workspace_ref: str, job_id: str, db: Session = Depends(get_db)) -> JobDetailResponse:
    workspace = resolve_workspace(workspace_ref, db)
    job = db.scalar(select(Job).where(Job.workspace_id == workspace.id, Job.id == job_id))
    if job is None:
        raise NotFoundError("job")
    timeline = list(db.scalars(select(JobEvent).where(JobEvent.job_id == job.id).order_by(JobEvent.sequence)))
    return JobDetailResponse(**job_response(job).model_dump(), timeline=[JobEventResponse(id=event.id, sequence=event.sequence, event_type=event.event_type, action_id=event.action_id, message=event.message, details=event.details_json, created_at=event.created_at) for event in timeline])


def resolve_integrity_incident_row(workspace: Workspace, incident_id: str, db: Session) -> IntegrityIncident:
    incident = db.scalar(select(IntegrityIncident).where(
        IntegrityIncident.workspace_id == workspace.id,
        IntegrityIncident.id == incident_id,
    ))
    if incident is None:
        raise NotFoundError("integrity_incident")
    return incident


@router.get("/workspaces/{workspace_ref}/audit/events", response_model=AuditEventPageResponse, tags=["audit"])
def list_audit_events(
    workspace_ref: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    event_type: str | None = None,
    from_sequence: int | None = Query(default=None, ge=1),
    to_sequence: int | None = Query(default=None, ge=1),
    trust_state: str | None = None,
    db: Session = Depends(get_db),
) -> AuditEventPageResponse:
    workspace = resolve_workspace(workspace_ref, db)
    filters = [AuditEvent.workspace_id == workspace.id]
    if event_type:
        filters.append(AuditEvent.event_type == event_type.upper())
    if from_sequence:
        filters.append(AuditEvent.sequence >= from_sequence)
    if to_sequence:
        filters.append(AuditEvent.sequence <= to_sequence)
    events = list(db.scalars(select(AuditEvent).where(*filters).order_by(AuditEvent.sequence)))
    trusted = trusted_through_sequence(db, workspace.id)
    items = [audit_event_response(event, trusted) for event in events]
    if trust_state:
        wanted = trust_state.upper()
        items = [item for item in items if item.trust_state == wanted]
    total = len(items)
    return AuditEventPageResponse(items=items[(page - 1) * page_size: page * page_size], page=page, page_size=page_size, total=total)


@router.get("/workspaces/{workspace_ref}/audit/events/{event_id}", response_model=AuditEventResponse, tags=["audit"])
def get_audit_event(workspace_ref: str, event_id: str, db: Session = Depends(get_db)) -> AuditEventResponse:
    workspace = resolve_workspace(workspace_ref, db)
    event = db.scalar(select(AuditEvent).where(AuditEvent.workspace_id == workspace.id, AuditEvent.id == event_id))
    if event is None:
        raise NotFoundError("audit_event")
    return audit_event_response(event, trusted_through_sequence(db, workspace.id))


@router.post("/workspaces/{workspace_ref}/audit/verify", response_model=AuditVerifyResponse, tags=["audit"])
def verify_audit_chain(workspace_ref: str, payload: AuditVerifyRequest, db: Session = Depends(get_db)) -> AuditVerifyResponse:
    workspace = resolve_workspace(workspace_ref, db)
    verification = verify_chain(db, workspace.id, payload.checkpoint_sequence)
    db.commit()
    db.refresh(verification)
    gate = evidence_gate(db, workspace.id)
    return AuditVerifyResponse(
        status=verification.status,
        evidence_state=verification.evidence_state,
        checked_event_total=verification.checked_event_total,
        verified_through_sequence=verification.verified_through_sequence,
        failure_sequence=verification.failure_sequence,
        untrusted_from_sequence=verification.untrusted_from_sequence,
        reason_code=verification.reason_code,
        reason_message=verification.reason_message,
        failures=[AuditFailureResponse(**failure) for failure in verification.failures_json],
        checkpoint_sequence=verification.checkpoint_sequence,
        checkpoint_status=verification.checkpoint_status,
        checkpoint_signed=verification.checkpoint_signed,
        gate_state=gate.state,
        incident_id=gate.incident_id,
        verified_at=verification.verified_at,
        disclaimer=EVIDENCE_DISCLAIMER,
    )


@router.get("/workspaces/{workspace_ref}/audit/status", response_model=AuditStatusResponse, tags=["audit"])
def get_audit_status(workspace_ref: str, db: Session = Depends(get_db)) -> AuditStatusResponse:
    workspace = resolve_workspace(workspace_ref, db)
    data = audit_status(db, workspace.id)
    latest = data["verification"]
    checkpoint = data["checkpoint"]
    gate = data["gate"]
    return AuditStatusResponse(
        workspace_id=workspace.id,
        chain=AuditChainSummary(
            head_sequence=data["chain_head_sequence"],
            head_hash=data["chain_head_hash"],
            event_total=data["event_total"],
            first_recorded_at=data["first_recorded_at"],
        ),
        checkpoint=AuditCheckpointStatus(
            sequence=checkpoint.sequence if checkpoint else None,
            head_hash=checkpoint.head_hash if checkpoint else None,
            key_id=checkpoint.key_id if checkpoint else None,
            signed_at=checkpoint.created_at if checkpoint else None,
            verification_status=latest.checkpoint_status if latest else None,
        ),
        verification=AuditVerificationSummary(
            status=latest.status if latest else "UNVERIFIED",
            evidence_state=latest.evidence_state if latest else "UNVERIFIED",
            verified_through_sequence=latest.verified_through_sequence if latest else None,
            failure_sequence=latest.failure_sequence if latest else None,
            reason_code=latest.reason_code if latest else None,
            verified_at=latest.verified_at if latest else None,
        ),
        gate=EvidenceGateSummary(
            state=gate.state,
            incident_id=gate.incident_id,
            failure_sequence=gate.failure_sequence,
            reason_code=gate.reason_code,
            untrusted_from_sequence=gate.untrusted_from_sequence,
        ),
        incidents=data["incidents"],
        breaches=data["breaches"],
        disclaimer=data["disclaimer"],
    )


@router.get("/workspaces/{workspace_ref}/audit/checkpoints", response_model=list[AuditCheckpointResponse], tags=["audit"])
def list_audit_checkpoints(workspace_ref: str, db: Session = Depends(get_db)) -> list[AuditCheckpointResponse]:
    workspace = resolve_workspace(workspace_ref, db)
    rows = db.scalars(select(AuditCheckpoint).where(AuditCheckpoint.workspace_id == workspace.id).order_by(AuditCheckpoint.sequence))
    return [audit_checkpoint_response(checkpoint) for checkpoint in rows]


@router.post("/workspaces/{workspace_ref}/audit/checkpoints", response_model=AuditCheckpointResponse, status_code=201, tags=["audit"])
def create_audit_checkpoint(workspace_ref: str, payload: AuditCheckpointCreateRequest, db: Session = Depends(get_db)) -> AuditCheckpointResponse:
    workspace = resolve_workspace(workspace_ref, db)
    try:
        checkpoint = create_checkpoint(db, workspace.id, payload.note)
    except EvidenceProblem:
        # Persist the verification, incident, and linked breach opened by the failed attempt.
        db.commit()
        raise
    db.commit()
    db.refresh(checkpoint)
    return audit_checkpoint_response(checkpoint)


@router.get("/workspaces/{workspace_ref}/audit/checkpoints/{sequence}", response_model=AuditCheckpointResponse, tags=["audit"])
def get_audit_checkpoint(workspace_ref: str, sequence: int, db: Session = Depends(get_db)) -> AuditCheckpointResponse:
    workspace = resolve_workspace(workspace_ref, db)
    checkpoint = db.scalar(select(AuditCheckpoint).where(
        AuditCheckpoint.workspace_id == workspace.id,
        AuditCheckpoint.sequence == sequence,
    ))
    if checkpoint is None:
        raise NotFoundError("audit_checkpoint")
    return audit_checkpoint_response(checkpoint)


@router.get("/workspaces/{workspace_ref}/audit/integrity-incidents", response_model=list[IntegrityIncidentResponse], tags=["audit"])
def list_integrity_incidents(workspace_ref: str, status: str | None = None, db: Session = Depends(get_db)) -> list[IntegrityIncidentResponse]:
    workspace = resolve_workspace(workspace_ref, db)
    filters = [IntegrityIncident.workspace_id == workspace.id]
    if status:
        filters.append(IntegrityIncident.status == status.upper())
    rows = db.scalars(select(IntegrityIncident).where(*filters).order_by(IntegrityIncident.detected_at.desc()))
    return [incident_response(incident) for incident in rows]


@router.get("/workspaces/{workspace_ref}/audit/integrity-incidents/{incident_id}", response_model=IntegrityIncidentResponse, tags=["audit"])
def get_integrity_incident(workspace_ref: str, incident_id: str, db: Session = Depends(get_db)) -> IntegrityIncidentResponse:
    workspace = resolve_workspace(workspace_ref, db)
    return incident_response(resolve_integrity_incident_row(workspace, incident_id, db))


@router.post("/workspaces/{workspace_ref}/audit/integrity-incidents/{incident_id}/resolve", response_model=IntegrityIncidentResponse, tags=["audit"])
def resolve_incident(workspace_ref: str, incident_id: str, payload: IntegrityIncidentResolveRequest, db: Session = Depends(get_db)) -> IntegrityIncidentResponse:
    workspace = resolve_workspace(workspace_ref, db)
    incident = resolve_integrity_incident_row(workspace, incident_id, db)
    try:
        resolve_integrity_incident(db, incident, payload.decision, payload.note)
    except EvidenceProblem:
        # Persist any verification evidence produced by a failed RESTORE_VERIFIED attempt.
        db.commit()
        raise
    db.commit()
    db.refresh(incident)
    return incident_response(incident)


def resolve_breach_row(workspace: Workspace, breach_id: str, db: Session) -> BreachIncident:
    breach = db.scalar(select(BreachIncident).where(
        BreachIncident.workspace_id == workspace.id,
        BreachIncident.id == breach_id,
    ))
    if breach is None:
        raise NotFoundError("breach")
    return breach


@router.post("/workspaces/{workspace_ref}/breaches", response_model=BreachDetailResponse, status_code=201, tags=["breach"])
def create_breach(workspace_ref: str, payload: BreachCreateRequest, db: Session = Depends(get_db)) -> BreachDetailResponse:
    workspace = resolve_workspace(workspace_ref, db)
    breach = register_breach(
        db,
        workspace,
        title=payload.title,
        description=payload.description,
        origin=payload.origin.upper(),
        origin_ref=payload.origin_ref,
        severity=payload.severity.upper(),
        detected_at=payload.detected_at,
        subject_refs=payload.subject_refs,
        source_ids=payload.source_ids,
        containment_summary=payload.containment_summary,
        created_by_reference=payload.created_by_reference,
    )
    db.commit()
    db.refresh(breach)
    return breach_detail_response(db, breach)


@router.get("/workspaces/{workspace_ref}/breaches", response_model=BreachPageResponse, tags=["breach"])
def list_breaches(
    workspace_ref: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status: str | None = None,
    origin: str | None = None,
    subject_ref: str | None = None,
    source_id: str | None = None,
    overdue: bool = False,
    db: Session = Depends(get_db),
) -> BreachPageResponse:
    workspace = resolve_workspace(workspace_ref, db)
    filters = [BreachIncident.workspace_id == workspace.id]
    if status:
        filters.append(BreachIncident.status == status.upper())
    if origin:
        filters.append(BreachIncident.origin == origin.upper())
    if subject_ref:
        filters.append(BreachIncident.id.in_(select(BreachAffectedSubject.breach_incident_id).where(
            BreachAffectedSubject.subject_ref == subject_ref,
        )))
    if source_id:
        filters.append(BreachIncident.id.in_(select(BreachAffectedSource.breach_incident_id).where(
            BreachAffectedSource.source_id == source_id,
        )))
    if overdue:
        filters.extend([
            BreachIncident.status != "CLOSED",
            BreachIncident.assessed_at.is_(None),
            BreachIncident.assessment_due_at < datetime.now(timezone.utc),
        ])
    total = db.scalar(select(func.count(BreachIncident.id)).where(*filters)) or 0
    rows = db.scalars(select(BreachIncident).where(*filters).order_by(BreachIncident.detected_at.desc()).offset((page - 1) * page_size).limit(page_size))
    return BreachPageResponse(items=[breach_response(db, breach) for breach in rows], page=page, page_size=page_size, total=total)


@router.get("/workspaces/{workspace_ref}/breaches/{breach_id}", response_model=BreachDetailResponse, tags=["breach"])
def get_breach(workspace_ref: str, breach_id: str, db: Session = Depends(get_db)) -> BreachDetailResponse:
    workspace = resolve_workspace(workspace_ref, db)
    return breach_detail_response(db, resolve_breach_row(workspace, breach_id, db))


@router.get("/workspaces/{workspace_ref}/breaches/{breach_id}/affected", response_model=BreachAffectedResponse, tags=["breach"])
def get_breach_affected(workspace_ref: str, breach_id: str, db: Session = Depends(get_db)) -> BreachAffectedResponse:
    workspace = resolve_workspace(workspace_ref, db)
    return BreachAffectedResponse(**breach_affected(db, resolve_breach_row(workspace, breach_id, db)))


@router.post("/workspaces/{workspace_ref}/breaches/{breach_id}/assessment", response_model=BreachDetailResponse, tags=["breach"])
def assess_breach_route(workspace_ref: str, breach_id: str, payload: BreachAssessmentRequest, db: Session = Depends(get_db)) -> BreachDetailResponse:
    workspace = resolve_workspace(workspace_ref, db)
    breach = resolve_breach_row(workspace, breach_id, db)
    assess_breach(db, breach, payload.notifiable, payload.reason_code, payload.note)
    db.commit()
    db.refresh(breach)
    return breach_detail_response(db, breach)


@router.post("/workspaces/{workspace_ref}/breaches/{breach_id}/notification-draft", response_model=BreachDetailResponse, tags=["breach"])
def draft_breach_notification(workspace_ref: str, breach_id: str, db: Session = Depends(get_db)) -> BreachDetailResponse:
    workspace = resolve_workspace(workspace_ref, db)
    breach = resolve_breach_row(workspace, breach_id, db)
    draft_notification(db, breach)
    db.commit()
    db.refresh(breach)
    return breach_detail_response(db, breach)


@router.post("/workspaces/{workspace_ref}/breaches/{breach_id}/close", response_model=BreachDetailResponse, tags=["breach"])
def close_breach_route(workspace_ref: str, breach_id: str, payload: BreachCloseRequest, db: Session = Depends(get_db)) -> BreachDetailResponse:
    workspace = resolve_workspace(workspace_ref, db)
    breach = resolve_breach_row(workspace, breach_id, db)
    close_breach(db, breach, payload.note)
    db.commit()
    db.refresh(breach)
    return breach_detail_response(db, breach)


def resolve_campaign(workspace: Workspace, campaign_id: str, db: Session) -> Campaign:
    campaign = db.scalar(select(Campaign).where(Campaign.workspace_id == workspace.id, Campaign.id == campaign_id))
    if campaign is None:
        raise NotFoundError("campaign")
    return campaign


@router.post("/workspaces/{workspace_ref}/campaigns", response_model=CampaignResponse, status_code=201, tags=["message-gate"])
def create_campaign(workspace_ref: str, payload: CampaignCreateRequest, db: Session = Depends(get_db)) -> CampaignResponse:
    workspace = resolve_workspace(workspace_ref, db)
    campaign = create_campaign_service(
        db,
        workspace,
        name=payload.name,
        purpose=payload.purpose,
        channel=payload.channel,
        message_template_id=payload.message_template_id,
        dataset_import_id=payload.dataset_import_id,
        record_ids=payload.record_ids,
    )
    db.commit()
    db.refresh(campaign)
    return campaign_response(db, campaign)


@router.get("/workspaces/{workspace_ref}/campaigns", response_model=list[CampaignResponse], tags=["message-gate"])
def list_campaigns(workspace_ref: str, status: str | None = None, db: Session = Depends(get_db)) -> list[CampaignResponse]:
    workspace = resolve_workspace(workspace_ref, db)
    statement = select(Campaign).where(Campaign.workspace_id == workspace.id)
    if status:
        statement = statement.where(Campaign.status == status)
    return [campaign_response(db, campaign) for campaign in db.scalars(statement.order_by(Campaign.created_at.desc()))]


@router.get("/workspaces/{workspace_ref}/campaigns/{campaign_id}", response_model=CampaignResponse, tags=["message-gate"])
def get_campaign(workspace_ref: str, campaign_id: str, db: Session = Depends(get_db)) -> CampaignResponse:
    return campaign_response(db, resolve_campaign(resolve_workspace(workspace_ref, db), campaign_id, db))


@router.post("/workspaces/{workspace_ref}/campaigns/{campaign_id}/preview", response_model=CampaignResponse, tags=["message-gate"])
def preview_campaign(workspace_ref: str, campaign_id: str, db: Session = Depends(get_db)) -> CampaignResponse:
    workspace = resolve_workspace(workspace_ref, db)
    campaign = preview_campaign_service(db, workspace, resolve_campaign(workspace, campaign_id, db))
    db.commit()
    db.refresh(campaign)
    return campaign_response(db, campaign)


@router.get("/workspaces/{workspace_ref}/campaigns/{campaign_id}/recipients", response_model=CampaignRecipientPageResponse, tags=["message-gate"])
def list_campaign_recipients(workspace_ref: str, campaign_id: str, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db)) -> CampaignRecipientPageResponse:
    workspace = resolve_workspace(workspace_ref, db)
    campaign = resolve_campaign(workspace, campaign_id, db)
    total = db.scalar(select(func.count(CampaignRecipient.id)).where(CampaignRecipient.campaign_id == campaign.id)) or 0
    recipients = db.scalars(select(CampaignRecipient).where(CampaignRecipient.campaign_id == campaign.id).order_by(CampaignRecipient.id).offset((page - 1) * page_size).limit(page_size))
    return CampaignRecipientPageResponse(items=[recipient_response(item) for item in recipients], page=page, page_size=page_size, total=total)


@router.post("/workspaces/{workspace_ref}/campaigns/{campaign_id}/execute", response_model=CampaignResponse, tags=["message-gate"])
def execute_campaign(workspace_ref: str, campaign_id: str, db: Session = Depends(get_db)) -> CampaignResponse:
    workspace = resolve_workspace(workspace_ref, db)
    campaign = execute_campaign_service(db, workspace, resolve_campaign(workspace, campaign_id, db))
    db.commit()
    db.refresh(campaign)
    return campaign_response(db, campaign)


@router.get("/workspaces/{workspace_ref}/outbox", response_model=OutboxPageResponse, tags=["message-gate"])
def list_outbox(workspace_ref: str, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), campaign_id: str | None = None, db: Session = Depends(get_db)) -> OutboxPageResponse:
    workspace = resolve_workspace(workspace_ref, db)
    filters = [MockOutbox.workspace_id == workspace.id]
    if campaign_id:
        filters.append(MockOutbox.campaign_id == campaign_id)
    total = db.scalar(select(func.count(MockOutbox.id)).where(*filters)) or 0
    rows = db.scalars(select(MockOutbox).where(*filters).order_by(MockOutbox.queued_at.desc()).offset((page - 1) * page_size).limit(page_size))
    return OutboxPageResponse(items=[OutboxResponse(id=item.id, campaign_id=item.campaign_id, campaign_recipient_id=item.campaign_recipient_id, subject_ref=item.subject_ref, masked_recipient_reference=item.masked_recipient_reference, message_template_id=item.message_template_id, dispatch_status=item.dispatch_status, queued_at=item.queued_at) for item in rows], page=page, page_size=page_size, total=total)


@router.post("/workspaces/{workspace_ref}/sources/{source_id}/imports", response_model=ImportResponse, status_code=201, tags=["imports"])
async def create_import(workspace_ref: str, source_id: str, response: Response, file: UploadFile = File(...), db: Session = Depends(get_db)) -> ImportResponse:
    workspace = resolve_workspace(workspace_ref, db)
    source = db.scalar(select(Source).where(Source.workspace_id == workspace.id, Source.id == source_id))
    if source is None:
        raise NotFoundError("source")
    payload = await file.read()
    imported, reused = ingest_file(db, workspace, source, file.filename or "", payload)
    if reused:
        response.status_code = 200
    return import_response(imported, reused)


@router.get("/workspaces/{workspace_ref}/imports", response_model=ImportPageResponse, tags=["imports"])
def list_imports(workspace_ref: str, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), source_id: str | None = None, status: str | None = None, db: Session = Depends(get_db)) -> ImportPageResponse:
    workspace = resolve_workspace(workspace_ref, db)
    filters = [DatasetImport.workspace_id == workspace.id]
    if source_id:
        filters.append(DatasetImport.source_id == source_id)
    if status:
        filters.append(DatasetImport.status == status)
    total = db.scalar(select(func.count(DatasetImport.id)).where(*filters)) or 0
    items = db.scalars(select(DatasetImport).where(*filters).order_by(DatasetImport.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    return ImportPageResponse(items=[import_response(item) for item in items], page=page, page_size=page_size, total=total)


def resolve_import(workspace: Workspace, import_id: str, db: Session) -> DatasetImport:
    import_row = db.scalar(select(DatasetImport).where(DatasetImport.workspace_id == workspace.id, DatasetImport.id == import_id))
    if import_row is None:
        raise NotFoundError("import")
    return import_row


@router.get("/workspaces/{workspace_ref}/imports/{import_id}", response_model=ImportResponse, tags=["imports"])
def get_import(workspace_ref: str, import_id: str, db: Session = Depends(get_db)) -> ImportResponse:
    return import_response(resolve_import(resolve_workspace(workspace_ref, db), import_id, db))


@router.get("/workspaces/{workspace_ref}/imports/{import_id}/schema", response_model=SchemaPreviewResponse, tags=["imports"])
def get_import_schema(workspace_ref: str, import_id: str, db: Session = Depends(get_db)) -> SchemaPreviewResponse:
    workspace = resolve_workspace(workspace_ref, db)
    resolve_import(workspace, import_id, db)
    profiles = db.scalars(select(ImportFieldProfile).where(ImportFieldProfile.dataset_import_id == import_id).order_by(ImportFieldProfile.ordinal))
    return SchemaPreviewResponse(import_id=import_id, fields=[FieldProfileResponse(
        id=profile.id, ordinal=profile.ordinal, source_field=profile.source_field, normalized_field=profile.normalized_field,
        primitive_type=profile.primitive_type, classification=profile.classification, confidence=profile.confidence,
        detection_reason=profile.detection_reason, non_null_count=profile.non_null_count, distinct_count=profile.distinct_count,
        masked_samples=profile.masked_samples_json, mapping_status=profile.mapping_status,
    ) for profile in profiles])


@router.get("/workspaces/{workspace_ref}/documents", response_model=PageResponse, tags=["documents"])
def list_documents(
    workspace_ref: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    document_type: str | None = None,
    source_id: str | None = None,
    db: Session = Depends(get_db),
) -> PageResponse:
    workspace = resolve_workspace(workspace_ref, db)
    filters = [Document.workspace_id == workspace.id]
    if document_type:
        filters.append(Document.document_type == document_type)
    if source_id:
        filters.append(Document.source_id == source_id)
    total = db.scalar(select(func.count(Document.id)).where(*filters)) or 0
    rows = db.scalars(
        select(Document)
        .where(*filters)
        .order_by(Document.document_created_at.desc(), Document.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return PageResponse(items=[document_response(row) for row in rows], page=page, page_size=page_size, total=total)


@router.get("/workspaces/{workspace_ref}/documents/{document_id}", response_model=DocumentResponse, tags=["documents"])
def get_document(workspace_ref: str, document_id: str, db: Session = Depends(get_db)) -> DocumentResponse:
    workspace = resolve_workspace(workspace_ref, db)
    document = db.scalar(select(Document).where(Document.workspace_id == workspace.id, Document.id == document_id))
    if document is None:
        raise NotFoundError("document")
    return document_response(document)


@router.get("/workspaces/{workspace_ref}/documents/{document_id}/extraction", response_model=DocumentExtractionResponse, tags=["documents"])
def get_document_extraction(workspace_ref: str, document_id: str, db: Session = Depends(get_db)) -> DocumentExtractionResponse:
    workspace = resolve_workspace(workspace_ref, db)
    document = db.scalar(select(Document).where(Document.workspace_id == workspace.id, Document.id == document_id))
    if document is None:
        raise NotFoundError("document")
    extraction = db.scalar(select(DocumentExtraction).where(DocumentExtraction.document_id == document.id))
    if extraction is None:
        raise NotFoundError("document_extraction")
    return DocumentExtractionResponse(
        document_id=document.id, dataset_import_id=extraction.dataset_import_id, extraction_status=extraction.extraction_status,
        character_count=extraction.character_count, redacted_text_preview=extraction.redacted_text_preview,
        entity_summary=extraction.entity_summary_json, warnings=extraction.warnings_json,
    )


@router.get("/workspaces/{workspace_ref}/records", response_model=RecordPageResponse, tags=["records"])
def list_records(
    workspace_ref: str, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), source_id: str | None = None,
    import_id: str | None = None, subject_ref: str | None = None, match_status: str | None = None, classification: str | None = None,
    db: Session = Depends(get_db),
) -> RecordPageResponse:
    workspace = resolve_workspace(workspace_ref, db)
    filters = [DataRecordRef.workspace_id == workspace.id]
    if source_id:
        filters.append(DataRecordRef.source_id == source_id)
    if import_id:
        filters.append(DataRecordRef.dataset_import_id == import_id)
    if subject_ref:
        filters.append(DataRecordRef.subject_ref == subject_ref)
    if match_status:
        filters.append(DataRecordRef.match_status == match_status)
    records = list(db.scalars(select(DataRecordRef).where(*filters).order_by(DataRecordRef.created_at.desc(), DataRecordRef.id)))
    if classification:
        records = [record for record in records if any(field.get("classification") == classification for field in record.field_metadata_json.values())]
    total = len(records)
    window = records[(page - 1) * page_size: page * page_size]
    return RecordPageResponse(items=[record_response(record) for record in window], page=page, page_size=page_size, total=total)


@router.get("/workspaces/{workspace_ref}/records/{record_id}", response_model=RecordResponse, tags=["records"])
def get_record(workspace_ref: str, record_id: str, db: Session = Depends(get_db)) -> RecordResponse:
    workspace = resolve_workspace(workspace_ref, db)
    record = db.scalar(select(DataRecordRef).where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.id == record_id))
    if record is None:
        raise NotFoundError("record")
    return record_response(record)


@router.get("/workspaces/{workspace_ref}/match-candidates", response_model=MatchCandidatePageResponse, tags=["records"])
def list_match_candidates(workspace_ref: str, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), status: str | None = None, db: Session = Depends(get_db)) -> MatchCandidatePageResponse:
    workspace = resolve_workspace(workspace_ref, db)
    filters = [MatchCandidate.workspace_id == workspace.id]
    if status:
        filters.append(MatchCandidate.status == status)
    total = db.scalar(select(func.count(MatchCandidate.id)).where(*filters)) or 0
    candidates = db.scalars(select(MatchCandidate).where(*filters).order_by(MatchCandidate.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    return MatchCandidatePageResponse(items=[MatchCandidateResponse(
        id=item.id, left_record_ref_id=item.left_record_ref_id, right_record_ref_id=item.right_record_ref_id,
        match_method=item.match_method, confidence=item.confidence, status=item.status, created_at=item.created_at,
    ) for item in candidates], page=page, page_size=page_size, total=total)


@router.get("/workspaces/{workspace_ref}/data-quality", response_model=DataQualityPageResponse, tags=["discovery"])
def list_quality_findings(workspace_ref: str, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), source_id: str | None = None, import_id: str | None = None, severity: str | None = None, db: Session = Depends(get_db)) -> DataQualityPageResponse:
    workspace = resolve_workspace(workspace_ref, db)
    filters = [DataQualityFinding.workspace_id == workspace.id]
    if source_id:
        filters.append(DataQualityFinding.source_id == source_id)
    if import_id:
        filters.append(DataQualityFinding.dataset_import_id == import_id)
    if severity:
        filters.append(DataQualityFinding.severity == severity)
    total = db.scalar(select(func.count(DataQualityFinding.id)).where(*filters)) or 0
    findings = db.scalars(select(DataQualityFinding).where(*filters).order_by(DataQualityFinding.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    return DataQualityPageResponse(items=[DataQualityFindingResponse(
        id=item.id, source_id=item.source_id, dataset_import_id=item.dataset_import_id, code=item.code,
        severity=item.severity, field_name=item.field_name, affected_record_count=item.affected_record_count,
        status=item.status, details=item.details_json, created_at=item.created_at,
    ) for item in findings], page=page, page_size=page_size, total=total)


@router.get("/workspaces/{workspace_ref}/dashboard", response_model=DashboardResponse, tags=["dashboard"])
def get_dashboard(workspace_ref: str, db: Session = Depends(get_db)) -> DashboardResponse:
    workspace = resolve_workspace(workspace_ref, db)
    source_total = db.scalar(select(func.count(Source.id)).where(Source.workspace_id == workspace.id)) or 0
    document_total = db.scalar(select(func.count(Document.id)).where(Document.workspace_id == workspace.id)) or 0
    source_rows = db.execute(
        select(Source.connection_status, func.count(Source.id)).where(Source.workspace_id == workspace.id).group_by(Source.connection_status)
    )
    document_rows = db.execute(
        select(Document.document_type, func.count(Document.id)).where(Document.workspace_id == workspace.id).group_by(Document.document_type)
    )
    import_total = db.scalar(select(func.count(DatasetImport.id)).where(DatasetImport.workspace_id == workspace.id)) or 0
    record_total = db.scalar(select(func.count(DataRecordRef.id)).where(DataRecordRef.workspace_id == workspace.id)) or 0
    review_total = db.scalar(select(func.count(DataRecordRef.id)).where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.match_status.in_(("REVIEW_REQUIRED", "CONFLICT")))) or 0
    finding_total = db.scalar(select(func.count(DataQualityFinding.id)).where(DataQualityFinding.workspace_id == workspace.id, DataQualityFinding.status == "OPEN")) or 0
    covered_source_ids = set(db.scalars(select(DatasetImport.source_id).where(DatasetImport.workspace_id == workspace.id, DatasetImport.status == "COMPLETE")))
    policy = db.scalar(select(Policy).where(Policy.workspace_id == workspace.id, Policy.status == "ACTIVE").order_by(Policy.version.desc()))
    decision_rows = list(db.execute(select(PolicyDecision.decision, func.count(PolicyDecision.id)).where(PolicyDecision.workspace_id == workspace.id).group_by(PolicyDecision.decision)))
    suppression_total = db.scalar(select(func.count(SuppressionRecord.id)).where(SuppressionRecord.workspace_id == workspace.id, SuppressionRecord.status == "ACTIVE")) or 0
    campaign_total = db.scalar(select(func.count(Campaign.id)).where(Campaign.workspace_id == workspace.id)) or 0
    outbox_total = db.scalar(select(func.count(MockOutbox.id)).where(MockOutbox.workspace_id == workspace.id)) or 0
    pending_rights_total = db.scalar(select(func.count(RightsRequest.id)).where(RightsRequest.workspace_id == workspace.id, RightsRequest.status.in_(("CREATED", "PLANNING", "EXECUTING")))) or 0
    active_job_total = db.scalar(select(func.count(Job.id)).where(Job.workspace_id == workspace.id, Job.status.in_(("RUNNING", "EXECUTING")))) or 0
    rights_review_total = db.scalar(select(func.count(RightsRequest.id)).where(RightsRequest.workspace_id == workspace.id, RightsRequest.status == "NEEDS_REVIEW")) or 0
    rights_partial_total = db.scalar(select(func.count(RightsRequest.id)).where(RightsRequest.workspace_id == workspace.id, RightsRequest.status == "PARTIAL")) or 0
    evidence = audit_status(db, workspace.id)
    latest_verification = evidence["verification"]
    trusted_through = trusted_through_sequence(db, workspace.id)
    untrusted_total = 0 if trusted_through is None else max(0, evidence["event_total"] - trusted_through)
    return DashboardResponse(
        workspace_id=workspace.id,
        source_total=source_total,
        document_total=document_total,
        sources_by_status={status: count for status, count in source_rows},
        documents_by_type={document_type: count for document_type, count in document_rows},
        workflow_summary={"pending_rights_requests": pending_rights_total, "active_jobs": active_job_total, "policy_decisions": sum(count for _, count in decision_rows), "integrity_alerts": evidence["incidents"]["open"]},
        import_total=import_total,
        record_total=record_total,
        records_requiring_review=review_total,
        unresolved_quality_findings=finding_total,
        source_coverage={"covered": len(covered_source_ids), "not_ingested": source_total - len(covered_source_ids)},
        active_policy_status=policy.status if policy else None,
        policy_decision_summary={decision: count for decision, count in decision_rows},
        active_suppression_total=suppression_total,
        campaign_total=campaign_total,
        mock_outbox_total=outbox_total,
        rights_requests_requiring_review=rights_review_total,
        rights_requests_partial=rights_partial_total,
        audit_integrity_status=latest_verification.status if latest_verification else "UNVERIFIED",
        evidence_state=latest_verification.evidence_state if latest_verification else "UNVERIFIED",
        audit_trusted_through_sequence=trusted_through,
        audit_untrusted_event_total=untrusted_total,
        integrity_gate_state=evidence["gate"].state,
        open_integrity_incident_total=evidence["incidents"]["open"],
        open_breach_incident_total=evidence["breaches"]["open"],
        overdue_breach_assessment_total=evidence["breaches"]["assessment_overdue"],
        breach_notification_draft_total=evidence["breaches"]["drafts_pending"],
    )
