from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class WorkspaceResponse(APIModel):
    id: str
    name: str
    slug: str
    demo_status: str
    created_at: datetime
    updated_at: datetime


class SourceResponse(APIModel):
    id: str
    source_key: str
    display_name: str
    source_type: str
    connection_status: str
    health_summary: str
    last_synced_at: datetime | None
    configuration_metadata: dict[str, Any]


class DocumentResponse(APIModel):
    id: str
    source_id: str
    document_key: str
    synthetic_label: str
    document_type: str
    filename: str
    mime_type: str
    preview_reference: str
    display_title: str
    document_created_at: datetime | None
    processing_status: str
    metadata: dict[str, Any]


class PageResponse(APIModel):
    items: list[DocumentResponse]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class HealthResponse(APIModel):
    status: str
    database: str
    migrations: str
    fixture_manifest: str


class DashboardResponse(APIModel):
    workspace_id: str
    source_total: int
    document_total: int
    sources_by_status: dict[str, int]
    documents_by_type: dict[str, int]
    workflow_summary: dict[str, int]
    import_total: int = 0
    record_total: int = 0
    records_requiring_review: int = 0
    unresolved_quality_findings: int = 0
    source_coverage: dict[str, int] = Field(default_factory=dict)
    active_policy_status: str | None = None
    policy_decision_summary: dict[str, int] = Field(default_factory=dict)
    active_suppression_total: int = 0
    campaign_total: int = 0
    mock_outbox_total: int = 0


class ImportResponse(APIModel):
    id: str
    source_id: str
    document_id: str | None
    filename: str
    content_type: str
    byte_size: int
    content_sha256: str
    status: str
    row_count: int | None
    error_code: str | None
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None
    idempotent_reuse: bool = False


class ImportPageResponse(APIModel):
    items: list[ImportResponse]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class FieldProfileResponse(APIModel):
    id: str
    ordinal: int
    source_field: str
    normalized_field: str
    primitive_type: str
    classification: str
    confidence: float
    detection_reason: str
    non_null_count: int
    distinct_count: int
    masked_samples: list[str]
    mapping_status: str


class SchemaPreviewResponse(APIModel):
    import_id: str
    fields: list[FieldProfileResponse]


class RecordResponse(APIModel):
    id: str
    source_id: str
    dataset_import_id: str
    subject_ref: str | None
    record_type: str
    match_status: str
    field_metadata: dict[str, Any]
    masked_preview: dict[str, str]
    created_at: datetime


class RecordPageResponse(APIModel):
    items: list[RecordResponse]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class MatchCandidateResponse(APIModel):
    id: str
    left_record_ref_id: str
    right_record_ref_id: str
    match_method: str
    confidence: float
    status: str
    created_at: datetime


class MatchCandidatePageResponse(APIModel):
    items: list[MatchCandidateResponse]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class DataQualityFindingResponse(APIModel):
    id: str
    source_id: str
    dataset_import_id: str | None
    code: str
    severity: str
    field_name: str | None
    affected_record_count: int
    status: str
    details: dict[str, Any]
    created_at: datetime


class DataQualityPageResponse(APIModel):
    items: list[DataQualityFindingResponse]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class DocumentExtractionResponse(APIModel):
    document_id: str
    dataset_import_id: str
    extraction_status: str
    character_count: int
    redacted_text_preview: str
    entity_summary: dict[str, int]
    warnings: list[str]


class PolicyResponse(APIModel):
    id: str
    policy_key: str
    version: int
    name: str
    status: str
    effective_at: datetime
    rules: dict[str, Any]
    synthetic_label: str


class PolicyEvaluationRequest(BaseModel):
    operation: str = "managed_marketing"
    subject_ref: str | None = None
    purpose: str | None = None
    channel: str | None = None


class PolicyDecisionResponse(APIModel):
    decision: str
    reason_codes: list[str]
    evaluated_rules: list[str]
    policy_id: str
    policy_version: int
    correlation_id: str
    evaluated_at: datetime


class AuthorizationCreateRequest(BaseModel):
    subject_ref: str
    purpose: str = Field(min_length=1, max_length=80)
    channel: str = Field(min_length=1, max_length=48)
    evidence_document_id: str | None = None
    evidence_source: str = Field(min_length=1, max_length=160)
    notice_version: str = Field(min_length=1, max_length=80)
    captured_at: datetime
    expires_at: datetime | None = None


class AuthorizationResponse(APIModel):
    id: str
    subject_ref: str
    purpose: str
    channel: str
    status: str
    evidence_document_id: str | None
    evidence_source: str
    notice_version: str
    captured_at: datetime
    expires_at: datetime | None
    withdrawn_at: datetime | None


class WithdrawalRequest(BaseModel):
    source: str = Field(default="subject_request", min_length=1, max_length=160)


class CampaignCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    purpose: str = Field(min_length=1, max_length=80)
    channel: str = Field(min_length=1, max_length=48)
    message_template_id: str = Field(min_length=1, max_length=100)
    dataset_import_id: str | None = None
    record_ids: list[str] = Field(default_factory=list, max_length=10_000)


class CampaignResponse(APIModel):
    id: str
    name: str
    purpose: str
    channel: str
    message_template_id: str
    dataset_import_id: str | None
    status: str
    synthetic_label: str
    created_at: datetime
    previewed_at: datetime | None
    executed_at: datetime | None
    recipient_total: int = 0
    decision_summary: dict[str, int] = Field(default_factory=dict)


class CampaignRecipientResponse(APIModel):
    id: str
    record_ref_id: str
    subject_ref: str | None
    preview_decision: str | None
    preview_reason_codes: list[str]
    previewed_at: datetime | None
    execution_decision: str | None
    execution_reason_codes: list[str]
    executed_at: datetime | None


class CampaignRecipientPageResponse(APIModel):
    items: list[CampaignRecipientResponse]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class OutboxResponse(APIModel):
    id: str
    campaign_id: str
    campaign_recipient_id: str
    subject_ref: str
    masked_recipient_reference: str
    message_template_id: str
    dispatch_status: str
    queued_at: datetime


class OutboxPageResponse(APIModel):
    items: list[OutboxResponse]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class ErrorDetail(APIModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(APIModel):
    error: ErrorDetail
