from typing import Any

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy import func, inspect, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import engine, get_db
from app.ingestion import IngestionProblem, ingest_file, mask_value, normalize_field
from app.models import DataQualityFinding, DataRecordRef, DatasetImport, Document, DocumentExtraction, FixtureManifest, ImportFieldProfile, MatchCandidate, Source, Workspace
from app.schemas import (
    DashboardResponse, DataQualityFindingResponse, DataQualityPageResponse, DocumentExtractionResponse, DocumentResponse,
    FieldProfileResponse, HealthResponse, ImportPageResponse, ImportResponse, MatchCandidatePageResponse,
    MatchCandidateResponse, PageResponse, RecordPageResponse, RecordResponse, SchemaPreviewResponse, SourceResponse,
    WorkspaceResponse,
)
from app.source_store import SourceStore

router = APIRouter(prefix="/api/v1")
REQUIRED_TABLES = {"workspaces", "sources", "documents", "fixture_manifests", "api_contract_versions", "dataset_imports", "import_field_profiles", "data_record_refs", "identity_tokens", "match_candidates", "data_quality_findings", "document_extractions", "alembic_version"}


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
    )
