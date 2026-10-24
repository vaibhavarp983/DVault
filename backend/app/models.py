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
