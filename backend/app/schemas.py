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
    rights_requests_requiring_review: int = 0
    rights_requests_partial: int = 0
    audit_integrity_status: str = "UNVERIFIED"
    evidence_state: str = "UNVERIFIED"
    audit_trusted_through_sequence: int | None = None
    audit_untrusted_event_total: int = 0
    integrity_gate_state: str = "OPEN"
    open_integrity_incident_total: int = 0
    open_breach_incident_total: int = 0
    overdue_breach_assessment_total: int = 0
    breach_notification_draft_total: int = 0


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


class RightsCorrectionRequest(BaseModel):
    field: str = Field(min_length=1, max_length=120)
    requested_value: str = Field(min_length=1, max_length=500)
    reason: str | None = Field(default=None, max_length=500)


class RightsRequestCreateRequest(BaseModel):
    subject_ref: str = Field(min_length=1, max_length=80)
    request_type: str = Field(min_length=1, max_length=24)
    idempotency_key: str = Field(min_length=1, max_length=120)
    requester_reference: str | None = Field(default=None, max_length=160)
    correction: RightsCorrectionRequest | None = None


class RightsRequestResponse(APIModel):
    id: str
    subject_ref: str
    request_type: str
    status: str
    idempotency_key: str
    correlation_id: str
    requester_reference: str | None
    summary: dict[str, Any]
    reference: str | None = None
    due_at: datetime | None = None
    correction_field: str | None = None
    created_at: datetime
    planned_at: datetime | None
    completed_at: datetime | None
    updated_at: datetime
    source_action_total: int = 0
    source_action_completed: int = 0
    unresolved_action_total: int = 0


class RightsRequestPageResponse(APIModel):
    items: list[RightsRequestResponse]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class RightsActionResponse(APIModel):
    id: str
    source_id: str
    action_type: str
    status: str
    attempt_count: int
    retry_eligible: bool
    affected_record_count: int
    result: dict[str, Any]
    error_code: str | None
    error_message: str | None
    planned_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    updated_at: datetime


class RightsActionPageResponse(APIModel):
    items: list[RightsActionResponse]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class JobResponse(APIModel):
    id: str
    rights_request_id: str
    operation: str
    status: str
    attempt_count: int
    action_total: int
    action_completed: int
    error_code: str | None
    error_message: str | None
    correlation_id: str
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class JobEventResponse(APIModel):
    id: str
    sequence: int
    event_type: str
    action_id: str | None
    message: str
    details: dict[str, Any]
    created_at: datetime


class JobDetailResponse(JobResponse):
    timeline: list[JobEventResponse]


class JobPageResponse(APIModel):
    items: list[JobResponse]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class RetentionHoldCreateRequest(BaseModel):
    subject_ref: str | None = Field(default=None, max_length=80)
    source_id: str | None = None
    record_ref_id: str | None = None
    reason_code: str = Field(min_length=1, max_length=80)
    review_note: str | None = Field(default=None, max_length=320)
    expires_at: datetime | None = None


class RetentionHoldResponse(APIModel):
    id: str
    subject_ref: str | None
    source_id: str | None
    record_ref_id: str | None
    status: str
    reason_code: str
    review_note: str | None
    expires_at: datetime | None
    released_at: datetime | None
    created_at: datetime


class RetentionHoldReleaseRequest(BaseModel):
    note: str | None = Field(default=None, max_length=320)


class FailureInjectionRequest(BaseModel):
    enabled: bool


class FailureInjectionResponse(APIModel):
    source_id: str
    source_key: str
    failure_injection_enabled: bool
    scope: str


class AccessArtifactResponse(APIModel):
    id: str
    rights_request_id: str
    status: str
    kind: str = "ACCESS_SUMMARY"
    source_summaries: list[dict[str, Any]]
    bundle: dict[str, Any] = Field(default_factory=dict)
    expires_at: datetime | None
    created_at: datetime
    completed_at: datetime | None


class AuditEventResponse(APIModel):
    id: str
    sequence: int
    event_type: str
    entity_type: str | None
    entity_ref: str | None
    payload: dict[str, Any]
    payload_sha256: str
    previous_hash: str
    event_hash: str
    occurred_at: datetime
    recorded_at: datetime
    actor_reference: str | None
    trust_state: str


class AuditEventPageResponse(APIModel):
    items: list[AuditEventResponse]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class AuditVerifyRequest(BaseModel):
    checkpoint_sequence: int | None = Field(default=None, ge=1)


class AuditFailureResponse(APIModel):
    sequence: int
    reason_code: str
    detail: str


class AuditVerifyResponse(APIModel):
    status: str
    evidence_state: str
    checked_event_total: int
    verified_through_sequence: int | None
    failure_sequence: int | None
    untrusted_from_sequence: int | None
    reason_code: str | None
    reason_message: str | None
    failures: list[AuditFailureResponse]
    checkpoint_sequence: int | None
    checkpoint_status: str | None
    checkpoint_signed: bool | None
    gate_state: str
    incident_id: str | None
    verified_at: datetime
    disclaimer: str


class AuditCheckpointCreateRequest(BaseModel):
    note: str | None = Field(default=None, max_length=320)


class AuditCheckpointResponse(APIModel):
    id: str
    sequence: int
    head_hash: str
    signature: str
    public_key: str
    key_id: str
    algorithm: str
    note: str | None
    created_at: datetime


class AuditChainSummary(APIModel):
    head_sequence: int
    head_hash: str | None
    event_total: int
    first_recorded_at: datetime | None


class AuditCheckpointStatus(APIModel):
    sequence: int | None
    head_hash: str | None
    key_id: str | None
    signed_at: datetime | None
    verification_status: str | None


class AuditVerificationSummary(APIModel):
    status: str
    evidence_state: str
    verified_through_sequence: int | None
    failure_sequence: int | None
    reason_code: str | None
    verified_at: datetime | None


class EvidenceGateSummary(APIModel):
    state: str
    incident_id: str | None
    failure_sequence: int | None
    reason_code: str | None
    untrusted_from_sequence: int | None


class AuditStatusResponse(APIModel):
    workspace_id: str
    chain: AuditChainSummary
    checkpoint: AuditCheckpointStatus
    verification: AuditVerificationSummary
    gate: EvidenceGateSummary
    incidents: dict[str, int]
    breaches: dict[str, int]
    disclaimer: str


class IntegrityIncidentResponse(APIModel):
    id: str
    status: str
    first_failure_sequence: int
    reason_code: str
    reason_message: str
    verification_id: str | None
    linked_breach_incident_id: str | None
    detected_at: datetime
    last_detected_at: datetime
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    resolution_decision: str | None
    resolution_note: str | None


class IntegrityIncidentResolveRequest(BaseModel):
    decision: str = Field(min_length=1, max_length=32)
    note: str = Field(min_length=8, max_length=500)


class BreachCreateRequest(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=3, max_length=4000)
    origin: str = Field(default="MANUAL", max_length=32)
    origin_ref: str | None = Field(default=None, max_length=120)
    severity: str = Field(default="MEDIUM", max_length=16)
    detected_at: datetime | None = None
    subject_refs: list[str] = Field(default_factory=list, max_length=500)
    source_ids: list[str] = Field(default_factory=list, max_length=100)
    containment_summary: str | None = Field(default=None, max_length=2000)
    created_by_reference: str | None = Field(default=None, max_length=160)


class BreachAssessmentRequest(BaseModel):
    notifiable: bool
    reason_code: str = Field(min_length=1, max_length=80)
    note: str | None = Field(default=None, max_length=500)


class BreachCloseRequest(BaseModel):
    note: str = Field(min_length=8, max_length=500)


class BreachAffectedSubjectResponse(APIModel):
    subject_ref: str
    resolution_status: str
    record_count: int
    sources: list[str]


class BreachAffectedSourceResponse(APIModel):
    source_id: str
    source_key: str
    display_name: str
    affected_record_count: int
    affected_subject_count: int


class BreachAffectedResponse(APIModel):
    breach_id: str
    incident_ref: str
    scope_status: str
    subjects: list[BreachAffectedSubjectResponse]
    sources: list[BreachAffectedSourceResponse]
    generated_at: datetime
    disclaimer: str


class BreachNotificationDraftResponse(APIModel):
    status: str
    subject: str | None
    body: str | None
    generated_at: datetime | None
    disclaimer: str


class BreachResponse(APIModel):
    id: str
    incident_ref: str
    title: str
    description: str
    origin: str
    origin_ref: str | None
    severity: str
    status: str
    scope_status: str
    detected_at: datetime
    assessment_due_at: datetime
    assessed_at: datetime | None
    notifiable: bool | None
    assessment_reason_code: str | None
    assessment_note: str | None
    assessment_timeliness: str | None
    timer_state: str
    assessment_status: str
    notification_status: str
    notification_drafted_at: datetime | None
    notification_subject: str | None
    containment_summary: str | None
    close_note: str | None
    linked_integrity_incident_id: str | None
    created_by_reference: str | None
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None
    affected_subject_total: int = 0
    affected_source_total: int = 0


class BreachDetailResponse(BreachResponse):
    notification: BreachNotificationDraftResponse | None = None
    affected: BreachAffectedResponse | None = None


class BreachPageResponse(APIModel):
    items: list[BreachResponse]
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total: int = Field(ge=0)


class ErrorDetail(APIModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(APIModel):
    error: ErrorDetail
