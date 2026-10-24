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


class ErrorDetail(APIModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(APIModel):
    error: ErrorDetail
