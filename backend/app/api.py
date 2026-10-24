from typing import Any

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy import func, inspect, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import engine, get_db
from app.ingestion import IngestionProblem, ingest_file, mask_value, normalize_field
from app.models import (
    AuthorizationRecord, Campaign, CampaignRecipient, DataQualityFinding, DataRecordRef, DatasetImport, Document,
    DocumentExtraction, FixtureManifest, ImportFieldProfile, MatchCandidate, MockOutbox, Policy, Source,
    PolicyDecision, SuppressionRecord, Workspace,
)
from app.policy import PolicyProblem, ensure_default_policy, evaluate_marketing, masked_subject_ref
from app.schemas import (
    AuthorizationCreateRequest, AuthorizationResponse, CampaignCreateRequest, CampaignRecipientPageResponse,
    CampaignRecipientResponse, CampaignResponse,
    DashboardResponse, DataQualityFindingResponse, DataQualityPageResponse, DocumentExtractionResponse, DocumentResponse,
    FieldProfileResponse, HealthResponse, ImportPageResponse, ImportResponse, MatchCandidatePageResponse,
    MatchCandidateResponse, OutboxPageResponse, OutboxResponse, PageResponse, PolicyDecisionResponse,
    PolicyEvaluationRequest, PolicyResponse, RecordPageResponse, RecordResponse, SchemaPreviewResponse,
    SourceResponse, WithdrawalRequest, WorkspaceResponse,
)
from app.source_store import SourceStore

router = APIRouter(prefix="/api/v1")
REQUIRED_TABLES = {"workspaces", "sources", "documents", "fixture_manifests", "api_contract_versions", "dataset_imports", "import_field_profiles", "data_record_refs", "identity_tokens", "match_candidates", "data_quality_findings", "document_extractions", "policies", "authorization_records", "suppression_records", "policy_decisions", "campaigns", "campaign_recipients", "mock_outbox", "alembic_version"}


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
        db.add(SuppressionRecord(workspace_id=workspace.id, subject_ref=item.subject_ref, purpose=item.purpose, channel=item.channel, status="ACTIVE", source=payload.source, effective_at=now))
        db.commit()
    db.refresh(item)
    return authorization_response(item)


def resolve_campaign(workspace: Workspace, campaign_id: str, db: Session) -> Campaign:
    campaign = db.scalar(select(Campaign).where(Campaign.workspace_id == workspace.id, Campaign.id == campaign_id))
    if campaign is None:
        raise NotFoundError("campaign")
    return campaign


@router.post("/workspaces/{workspace_ref}/campaigns", response_model=CampaignResponse, status_code=201, tags=["message-gate"])
def create_campaign(workspace_ref: str, payload: CampaignCreateRequest, db: Session = Depends(get_db)) -> CampaignResponse:
    workspace = resolve_workspace(workspace_ref, db)
    if bool(payload.dataset_import_id) == bool(payload.record_ids):
        raise PolicyProblem("INVALID_CAMPAIGN_RECIPIENTS", "Provide exactly one of dataset_import_id or record_ids.")
    if payload.dataset_import_id:
        imported = resolve_import(workspace, payload.dataset_import_id, db)
        if imported.status != "COMPLETE":
            raise PolicyProblem("IMPORT_NOT_READY", "Campaign recipients must come from a completed import.")
        records = list(db.scalars(select(DataRecordRef).where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.dataset_import_id == imported.id)))
    else:
        records = list(db.scalars(select(DataRecordRef).where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.id.in_(payload.record_ids))))
        if len(records) != len(set(payload.record_ids)):
            raise PolicyProblem("RECORD_NOT_FOUND", "One or more campaign recipients were not found.")
    if not records:
        raise PolicyProblem("CAMPAIGN_RECIPIENTS_EMPTY", "The selected campaign has no recipients.")
    campaign = Campaign(workspace_id=workspace.id, name=payload.name, purpose=payload.purpose, channel=payload.channel, message_template_id=payload.message_template_id, dataset_import_id=payload.dataset_import_id, status="DRAFT")
    db.add(campaign)
    db.flush()
    for record in records:
        db.add(CampaignRecipient(campaign_id=campaign.id, record_ref_id=record.id, subject_ref=record.subject_ref))
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
    campaign = resolve_campaign(workspace, campaign_id, db)
    if campaign.status == "EXECUTED":
        raise ConflictError("CAMPAIGN_ALREADY_EXECUTED", "An executed campaign cannot be previewed again.")
    recipients = list(db.scalars(select(CampaignRecipient).where(CampaignRecipient.campaign_id == campaign.id)))
    for recipient in recipients:
        record = db.scalar(select(DataRecordRef).where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.id == recipient.record_ref_id))
        result = evaluate_marketing(db, workspace, recipient.subject_ref, campaign.purpose, campaign.channel, record=record, correlation_id=f"campaign:{campaign.id}:preview:{recipient.id}")
        recipient.preview_decision = result.decision
        recipient.preview_reason_codes_json = result.reason_codes
        recipient.previewed_at = result.evaluated_at
    campaign.status = "PREVIEWED"
    campaign.previewed_at = datetime.now(timezone.utc)
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
    campaign = resolve_campaign(workspace, campaign_id, db)
    if campaign.status != "PREVIEWED":
        raise ConflictError("CAMPAIGN_PREVIEW_REQUIRED", "Campaign execution requires a completed preview.")
    recipients = list(db.scalars(select(CampaignRecipient).where(CampaignRecipient.campaign_id == campaign.id)))
    for recipient in recipients:
        record = db.scalar(select(DataRecordRef).where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.id == recipient.record_ref_id))
        result = evaluate_marketing(db, workspace, recipient.subject_ref, campaign.purpose, campaign.channel, record=record, correlation_id=f"campaign:{campaign.id}:execute:{recipient.id}")
        recipient.execution_decision = result.decision
        recipient.execution_reason_codes_json = result.reason_codes
        recipient.executed_at = result.evaluated_at
        if result.decision == "ALLOW" and recipient.subject_ref:
            db.add(MockOutbox(workspace_id=workspace.id, campaign_id=campaign.id, campaign_recipient_id=recipient.id, subject_ref=recipient.subject_ref, masked_recipient_reference=masked_subject_ref(recipient.subject_ref), message_template_id=campaign.message_template_id, dispatch_status="QUEUED"))
    campaign.status = "EXECUTED"
    campaign.executed_at = datetime.now(timezone.utc)
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
    decision_rows = db.execute(select(PolicyDecision.decision, func.count(PolicyDecision.id)).where(PolicyDecision.workspace_id == workspace.id).group_by(PolicyDecision.decision))
    suppression_total = db.scalar(select(func.count(SuppressionRecord.id)).where(SuppressionRecord.workspace_id == workspace.id, SuppressionRecord.status == "ACTIVE")) or 0
    campaign_total = db.scalar(select(func.count(Campaign.id)).where(Campaign.workspace_id == workspace.id)) or 0
    outbox_total = db.scalar(select(func.count(MockOutbox.id)).where(MockOutbox.workspace_id == workspace.id)) or 0
    return DashboardResponse(
        workspace_id=workspace.id,
        source_total=source_total,
        document_total=document_total,
        sources_by_status={status: count for status, count in source_rows},
        documents_by_type={document_type: count for document_type, count in document_rows},
        workflow_summary={"pending_rights_requests": 0, "active_jobs": 0, "policy_decisions": 0, "integrity_alerts": 0},
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
    )
