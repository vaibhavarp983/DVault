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


class ErrorDetail(APIModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(APIModel):
    error: ErrorDetail
