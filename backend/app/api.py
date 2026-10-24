from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, inspect, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import engine, get_db
from app.models import Document, FixtureManifest, Source, Workspace
from app.schemas import DashboardResponse, DocumentResponse, HealthResponse, PageResponse, SourceResponse, WorkspaceResponse

router = APIRouter(prefix="/api/v1")
REQUIRED_TABLES = {"workspaces", "sources", "documents", "fixture_manifests", "api_contract_versions", "alembic_version"}


class NotFoundError(Exception):
    def __init__(self, resource: str) -> None:
        self.resource = resource


class ServiceUnavailableError(Exception):
    def __init__(self, message: str) -> None:
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
    return DashboardResponse(
        workspace_id=workspace.id,
        source_total=source_total,
        document_total=document_total,
        sources_by_status={status: count for status, count in source_rows},
        documents_by_type={document_type: count for document_type, count in document_rows},
        workflow_summary={"pending_rights_requests": 0, "active_jobs": 0, "policy_decisions": 0, "integrity_alerts": 0},
    )
