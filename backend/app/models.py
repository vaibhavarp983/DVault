from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    demo_status: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class Source(Base):
    __tablename__ = "sources"
    __table_args__ = (UniqueConstraint("workspace_id", "source_key", name="uq_source_workspace_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    source_key: Mapped[str] = mapped_column(String(80))
    display_name: Mapped[str] = mapped_column(String(160))
    source_type: Mapped[str] = mapped_column(String(48))
    connection_status: Mapped[str] = mapped_column(String(32))
    health_summary: Mapped[str] = mapped_column(String(320))
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    configuration_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class FixtureManifest(Base):
    __tablename__ = "fixture_manifests"
    __table_args__ = (UniqueConstraint("workspace_id", "fixture_version", name="uq_manifest_workspace_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"))
    fixture_version: Mapped[str] = mapped_column(String(40))
    checksum: Mapped[str] = mapped_column(String(64))
    generator_label: Mapped[str] = mapped_column(String(160))
    seeded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ApiContractVersion(Base):
    __tablename__ = "api_contract_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    version: Mapped[str] = mapped_column(String(32), unique=True)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    compatibility_status: Mapped[str] = mapped_column(String(32))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (UniqueConstraint("workspace_id", "document_key", name="uq_document_workspace_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    document_key: Mapped[str] = mapped_column(String(100))
    synthetic_label: Mapped[str] = mapped_column(String(64))
    document_type: Mapped[str] = mapped_column(String(48), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    source_path: Mapped[str] = mapped_column(String(500))
    display_title: Mapped[str] = mapped_column(String(255))
    document_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    processing_status: Mapped[str] = mapped_column(String(32))
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    review_status: Mapped[str] = mapped_column(String(24), default="AUTO", index=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    preview_json: Mapped[dict] = mapped_column(JSON, default=dict)
    primary_subject_ref: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class DatasetImport(Base):
    __tablename__ = "dataset_imports"
    __table_args__ = (UniqueConstraint("source_id", "content_sha256", name="uq_import_source_fingerprint"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), nullable=True)
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    byte_size: Mapped[int] = mapped_column(Integer)
    content_sha256: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), index=True)
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ImportFieldProfile(Base):
    __tablename__ = "import_field_profiles"
    __table_args__ = (UniqueConstraint("dataset_import_id", "ordinal", name="uq_profile_import_ordinal"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    dataset_import_id: Mapped[str] = mapped_column(ForeignKey("dataset_imports.id"), index=True)
    ordinal: Mapped[int] = mapped_column(Integer)
    source_field: Mapped[str] = mapped_column(String(255))
    normalized_field: Mapped[str] = mapped_column(String(255))
    primitive_type: Mapped[str] = mapped_column(String(32))
    classification: Mapped[str] = mapped_column(String(48), index=True)
    confidence: Mapped[float] = mapped_column(Float)
    detection_reason: Mapped[str] = mapped_column(String(255))
    non_null_count: Mapped[int] = mapped_column(Integer)
    distinct_count: Mapped[int] = mapped_column(Integer)
    masked_samples_json: Mapped[list] = mapped_column(JSON, default=list)
    mapping_status: Mapped[str] = mapped_column(String(32), index=True)


class DataRecordRef(Base):
    __tablename__ = "data_record_refs"
    __table_args__ = (UniqueConstraint("dataset_import_id", "source_record_id", name="uq_record_import_source_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    dataset_import_id: Mapped[str] = mapped_column(ForeignKey("dataset_imports.id"), index=True)
    source_record_id: Mapped[str] = mapped_column(String(100))
    subject_ref: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    record_type: Mapped[str] = mapped_column(String(48))
    match_status: Mapped[str] = mapped_column(String(32), index=True)
    field_metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class IdentityToken(Base):
    __tablename__ = "identity_tokens"
    __table_args__ = (UniqueConstraint("record_ref_id", "token_type", "hmac_token", name="uq_token_record_value"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    record_ref_id: Mapped[str] = mapped_column(ForeignKey("data_record_refs.id"), index=True)
    token_type: Mapped[str] = mapped_column(String(32), index=True)
    hmac_token: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class MatchCandidate(Base):
    __tablename__ = "match_candidates"
    __table_args__ = (UniqueConstraint("left_record_ref_id", "right_record_ref_id", name="uq_match_pair"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    left_record_ref_id: Mapped[str] = mapped_column(ForeignKey("data_record_refs.id"), index=True)
    right_record_ref_id: Mapped[str] = mapped_column(ForeignKey("data_record_refs.id"), index=True)
    match_method: Mapped[str] = mapped_column(String(64))
    confidence: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(32), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class DataQualityFinding(Base):
    __tablename__ = "data_quality_findings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    dataset_import_id: Mapped[str | None] = mapped_column(ForeignKey("dataset_imports.id"), nullable=True, index=True)
    code: Mapped[str] = mapped_column(String(80), index=True)
    severity: Mapped[str] = mapped_column(String(16), index=True)
    field_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    affected_record_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="OPEN")
    details_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class DocumentExtraction(Base):
    __tablename__ = "document_extractions"
    __table_args__ = (UniqueConstraint("document_id", name="uq_extraction_document"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id"), index=True)
    dataset_import_id: Mapped[str] = mapped_column(ForeignKey("dataset_imports.id"), index=True)
    extraction_status: Mapped[str] = mapped_column(String(32))
    character_count: Mapped[int] = mapped_column(Integer)
    redacted_text_preview: Mapped[str] = mapped_column(Text)
    entity_summary_json: Mapped[dict] = mapped_column(JSON, default=dict)
    warnings_json: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class Policy(Base):
    __tablename__ = "policies"
    __table_args__ = (UniqueConstraint("workspace_id", "policy_key", "version", name="uq_policy_workspace_version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    policy_key: Mapped[str] = mapped_column(String(100), index=True)
    version: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(32), index=True)
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    rules_json: Mapped[dict] = mapped_column(JSON, default=dict)
    synthetic_label: Mapped[str] = mapped_column(String(64), default="synthetic_demo_policy")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AuthorizationRecord(Base):
    __tablename__ = "authorization_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    subject_ref: Mapped[str] = mapped_column(String(80), index=True)
    purpose: Mapped[str] = mapped_column(String(80), index=True)
    channel: Mapped[str] = mapped_column(String(48), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    evidence_document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id"), nullable=True)
    evidence_source: Mapped[str] = mapped_column(String(160))
    notice_version: Mapped[str] = mapped_column(String(80))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class SuppressionRecord(Base):
    __tablename__ = "suppression_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    subject_ref: Mapped[str] = mapped_column(String(80), index=True)
    purpose: Mapped[str | None] = mapped_column(String(80), nullable=True)
    channel: Mapped[str | None] = mapped_column(String(48), nullable=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    source: Mapped[str] = mapped_column(String(160))
    effective_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class PolicyDecision(Base):
    __tablename__ = "policy_decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    operation: Mapped[str] = mapped_column(String(80), index=True)
    subject_ref: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    purpose: Mapped[str | None] = mapped_column(String(80), nullable=True)
    channel: Mapped[str | None] = mapped_column(String(48), nullable=True)
    decision: Mapped[str] = mapped_column(String(16), index=True)
    evaluated_rules_json: Mapped[list] = mapped_column(JSON, default=list)
    reason_codes_json: Mapped[list] = mapped_column(JSON, default=list)
    policy_id: Mapped[str] = mapped_column(String(36), ForeignKey("policies.id"))
    policy_version: Mapped[int] = mapped_column(Integer)
    correlation_id: Mapped[str] = mapped_column(String(80), index=True)
    context_fingerprint: Mapped[str] = mapped_column(String(64))
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    purpose: Mapped[str] = mapped_column(String(80))
    channel: Mapped[str] = mapped_column(String(48))
    message_template_id: Mapped[str] = mapped_column(String(100))
    dataset_import_id: Mapped[str | None] = mapped_column(ForeignKey("dataset_imports.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), index=True, default="DRAFT")
    synthetic_label: Mapped[str] = mapped_column(String(64), default="synthetic_mock_delivery")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    previewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CampaignRecipient(Base):
    __tablename__ = "campaign_recipients"
    __table_args__ = (UniqueConstraint("campaign_id", "record_ref_id", name="uq_campaign_record"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    campaign_id: Mapped[str] = mapped_column(ForeignKey("campaigns.id"), index=True)
    record_ref_id: Mapped[str] = mapped_column(ForeignKey("data_record_refs.id"), index=True)
    subject_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    preview_decision: Mapped[str | None] = mapped_column(String(16), nullable=True)
    preview_reason_codes_json: Mapped[list] = mapped_column(JSON, default=list)
    previewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    execution_decision: Mapped[str | None] = mapped_column(String(16), nullable=True)
    execution_reason_codes_json: Mapped[list] = mapped_column(JSON, default=list)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MockOutbox(Base):
    __tablename__ = "mock_outbox"
    __table_args__ = (UniqueConstraint("campaign_recipient_id", name="uq_outbox_campaign_recipient"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    campaign_id: Mapped[str] = mapped_column(ForeignKey("campaigns.id"), index=True)
    campaign_recipient_id: Mapped[str] = mapped_column(ForeignKey("campaign_recipients.id"), index=True)
    subject_ref: Mapped[str] = mapped_column(String(80))
    masked_recipient_reference: Mapped[str] = mapped_column(String(120))
    message_template_id: Mapped[str] = mapped_column(String(100))
    dispatch_status: Mapped[str] = mapped_column(String(32), default="QUEUED")
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class RightsRequest(Base):
    __tablename__ = "rights_requests"
    __table_args__ = (UniqueConstraint("workspace_id", "idempotency_key", name="uq_rights_request_idempotency"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    subject_ref: Mapped[str] = mapped_column(String(80), index=True)
    request_type: Mapped[str] = mapped_column(String(24), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True, default="CREATED")
    idempotency_key: Mapped[str] = mapped_column(String(120))
    correlation_id: Mapped[str] = mapped_column(String(80), index=True)
    requester_reference: Mapped[str | None] = mapped_column(String(160), nullable=True)
    summary_json: Mapped[dict] = mapped_column(JSON, default=dict)
    reference: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    correction_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    planned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class RightsRequestAction(Base):
    __tablename__ = "rights_request_actions"
    __table_args__ = (UniqueConstraint("rights_request_id", "source_id", "action_type", name="uq_rights_action_source_operation"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    rights_request_id: Mapped[str] = mapped_column(ForeignKey("rights_requests.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    action_type: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True, default="PENDING")
    idempotency_key: Mapped[str] = mapped_column(String(160), unique=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    retry_eligible: Mapped[bool] = mapped_column(Boolean, default=True)
    affected_record_count: Mapped[int] = mapped_column(Integer, default=0)
    result_json: Mapped[dict] = mapped_column(JSON, default=dict)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(320), nullable=True)
    planned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class RetentionHold(Base):
    __tablename__ = "retention_holds"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    subject_ref: Mapped[str | None] = mapped_column(String(80), index=True, nullable=True)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"), index=True, nullable=True)
    record_ref_id: Mapped[str | None] = mapped_column(ForeignKey("data_record_refs.id"), index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(32), index=True, default="ACTIVE")
    reason_code: Mapped[str] = mapped_column(String(80))
    review_note: Mapped[str | None] = mapped_column(String(320), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class RightsAccessArtifact(Base):
    __tablename__ = "rights_access_artifacts"
    __table_args__ = (UniqueConstraint("rights_request_id", name="uq_access_artifact_request"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    rights_request_id: Mapped[str] = mapped_column(ForeignKey("rights_requests.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True, default="BUILDING")
    kind: Mapped[str] = mapped_column(String(32), default="ACCESS_SUMMARY", index=True)
    source_summaries_json: Mapped[list] = mapped_column(JSON, default=list)
    bundle_json: Mapped[dict] = mapped_column(JSON, default=dict)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    rights_request_id: Mapped[str] = mapped_column(ForeignKey("rights_requests.id"), index=True)
    operation: Mapped[str] = mapped_column(String(48), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True, default="QUEUED")
    attempt_count: Mapped[int] = mapped_column(Integer, default=1)
    action_total: Mapped[int] = mapped_column(Integer, default=0)
    action_completed: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(320), nullable=True)
    correlation_id: Mapped[str] = mapped_column(String(80), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class JobEvent(Base):
    __tablename__ = "job_events"
    __table_args__ = (UniqueConstraint("job_id", "sequence", name="uq_job_event_sequence"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(48), index=True)
    action_id: Mapped[str | None] = mapped_column(ForeignKey("rights_request_actions.id"), nullable=True, index=True)
    message: Mapped[str] = mapped_column(String(320))
    details_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (UniqueConstraint("workspace_id", "sequence", name="uq_audit_event_sequence"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    sequence: Mapped[int] = mapped_column(Integer, index=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str | None] = mapped_column(String(48), nullable=True)
    entity_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    payload_schema: Mapped[str] = mapped_column(String(48), default="dvault-audit-payload-v1")
    canonical_payload: Mapped[str] = mapped_column(Text)
    payload_sha256: Mapped[str] = mapped_column(String(64))
    previous_hash: Mapped[str] = mapped_column(String(64))
    event_hash: Mapped[str] = mapped_column(String(64), index=True)
    actor_reference: Mapped[str | None] = mapped_column(String(160), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class AuditCheckpoint(Base):
    __tablename__ = "audit_checkpoints"
    __table_args__ = (UniqueConstraint("workspace_id", "sequence", name="uq_audit_checkpoint_sequence"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    head_hash: Mapped[str] = mapped_column(String(64))
    signature: Mapped[str] = mapped_column(Text)
    public_key: Mapped[str] = mapped_column(String(64))
    key_id: Mapped[str] = mapped_column(String(64))
    algorithm: Mapped[str] = mapped_column(String(24), default="Ed25519")
    note: Mapped[str | None] = mapped_column(String(320), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AuditVerification(Base):
    __tablename__ = "audit_verifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    status: Mapped[str] = mapped_column(String(24), index=True)
    evidence_state: Mapped[str] = mapped_column(String(32))
    checked_event_total: Mapped[int] = mapped_column(Integer, default=0)
    verified_through_sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    failure_sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    untrusted_from_sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    reason_message: Mapped[str | None] = mapped_column(String(320), nullable=True)
    failures_json: Mapped[list] = mapped_column(JSON, default=list)
    checkpoint_sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    checkpoint_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    checkpoint_signed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class IntegrityIncident(Base):
    __tablename__ = "integrity_incidents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    status: Mapped[str] = mapped_column(String(24), index=True, default="OPEN")
    first_failure_sequence: Mapped[int] = mapped_column(Integer)
    reason_code: Mapped[str] = mapped_column(String(80))
    reason_message: Mapped[str] = mapped_column(String(320))
    verification_id: Mapped[str | None] = mapped_column(ForeignKey("audit_verifications.id"), nullable=True)
    linked_breach_incident_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_decision: Mapped[str | None] = mapped_column(String(32), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class BreachIncident(Base):
    __tablename__ = "breach_incidents"
    __table_args__ = (UniqueConstraint("workspace_id", "incident_ref", name="uq_breach_incident_ref"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    incident_ref: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    origin: Mapped[str] = mapped_column(String(32), index=True, default="MANUAL")
    origin_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    severity: Mapped[str] = mapped_column(String(16), default="MEDIUM")
    status: Mapped[str] = mapped_column(String(32), index=True, default="DRAFT")
    scope_status: Mapped[str] = mapped_column(String(24), default="KNOWN")
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    assessment_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    assessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notifiable: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    assessment_reason_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    assessment_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    assessment_timeliness: Mapped[str | None] = mapped_column(String(24), nullable=True)
    notification_status: Mapped[str] = mapped_column(String(24), default="NONE")
    notification_drafted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notification_subject: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notification_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    containment_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    close_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    linked_integrity_incident_id: Mapped[str | None] = mapped_column(ForeignKey("integrity_incidents.id"), nullable=True)
    created_by_reference: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BreachAffectedSubject(Base):
    __tablename__ = "breach_affected_subjects"
    __table_args__ = (UniqueConstraint("breach_incident_id", "subject_ref", name="uq_breach_subject"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    breach_incident_id: Mapped[str] = mapped_column(ForeignKey("breach_incidents.id"), index=True)
    subject_ref: Mapped[str] = mapped_column(String(80))
    resolution_status: Mapped[str] = mapped_column(String(24), default="UNRESOLVED")
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    sources_json: Mapped[list] = mapped_column(JSON, default=list)


class BreachAffectedSource(Base):
    __tablename__ = "breach_affected_sources"
    __table_args__ = (UniqueConstraint("breach_incident_id", "source_id", name="uq_breach_source"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    breach_incident_id: Mapped[str] = mapped_column(ForeignKey("breach_incidents.id"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    affected_record_count: Mapped[int] = mapped_column(Integer, default=0)
    affected_subject_count: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(String(320), nullable=True)


class DemoCustomer(Base):
    __tablename__ = "demo_customers"
    __table_args__ = (UniqueConstraint("workspace_id", "subject_ref", name="uq_demo_customer_subject"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    subject_ref: Mapped[str] = mapped_column(String(80), index=True)
    display_name: Mapped[str] = mapped_column(String(160))
    company: Mapped[str] = mapped_column(String(160))
    email_masked: Mapped[str] = mapped_column(String(160), default="")
    phone_masked: Mapped[str] = mapped_column(String(80), default="")
    segment: Mapped[str] = mapped_column(String(32), default="Consumer")
    status: Mapped[str] = mapped_column(String(32), default="active")
    owner: Mapped[str] = mapped_column(String(120), default="Operations")
    location: Mapped[str] = mapped_column(String(160), default="")
    since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_ids_json: Mapped[list] = mapped_column(JSON, default=list)
    primary_source_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"), nullable=True)
    primary_source_record_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)


class DemoFailureLog(Base):
    __tablename__ = "demo_failure_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), index=True)
    kind: Mapped[str] = mapped_column(String(40), index=True)
    target_ref: Mapped[str | None] = mapped_column(String(120), nullable=True)
    details_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
