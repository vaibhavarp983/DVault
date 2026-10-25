import hashlib
import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.models import ApiContractVersion, Document, FixtureManifest, Source, Workspace
from app.policy import ensure_default_policy

FIXTURE_DIR = Path(__file__).parent / "fixtures"
MANIFEST_PATH = FIXTURE_DIR / "manifest.json"
SYNTHETIC_LABEL = "synthetic_demo_data"


def _parse_timestamp(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def _manifest() -> tuple[dict, str]:
    raw = MANIFEST_PATH.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def _upsert(session: Session, model: type, lookup: dict, values: dict):
    existing = session.scalar(select(model).filter_by(**lookup))
    if existing is None:
        return model(**values)
    for key, value in values.items():
        setattr(existing, key, value)
    return existing


def seed_workspace(session: Session, workspace: Workspace | None = None) -> dict:
    manifest, checksum = _manifest()
    workspace_spec = manifest["workspace"]
    if workspace is None:
        workspace = _upsert(
            session,
            Workspace,
            {"slug": workspace_spec["slug"]},
            workspace_spec,
        )
    session.add(workspace)
    session.flush()

    sources_by_key: dict[str, Source] = {}
    for source_spec in manifest["sources"]:
        values = {**source_spec, "workspace_id": workspace.id, "last_synced_at": _parse_timestamp(source_spec["last_synced_at"])}
        source = _upsert(session, Source, {"workspace_id": workspace.id, "source_key": source_spec["source_key"]}, values)
        session.add(source)
        session.flush()
        sources_by_key[source.source_key] = source

    for document_spec in manifest["documents"]:
        source_id = sources_by_key[document_spec["source_key"]].id
        values = {
            "id": document_spec["id"],
            "workspace_id": workspace.id,
            "source_id": source_id,
            "document_key": document_spec["document_key"],
            "synthetic_label": SYNTHETIC_LABEL,
            "document_type": document_spec["document_type"],
            "filename": document_spec["filename"],
            "mime_type": "text/plain" if document_spec["filename"].endswith(".txt") else "text/csv",
            "source_path": document_spec["source_path"],
            "display_title": document_spec["display_title"],
            "document_created_at": _parse_timestamp(document_spec["created_at"]),
            "processing_status": "catalogued",
            "metadata_json": {"synthetic": True, "source_key": document_spec["source_key"]},
        }
        document = _upsert(session, Document, {"workspace_id": workspace.id, "document_key": values["document_key"]}, values)
        session.add(document)

    manifest_record = _upsert(
        session,
        FixtureManifest,
        {"workspace_id": workspace.id, "fixture_version": manifest["fixture_version"]},
        {
            "workspace_id": workspace.id,
            "fixture_version": manifest["fixture_version"],
            "checksum": checksum,
            "generator_label": manifest["generator_label"],
            "is_active": True,
        },
    )
    session.add(manifest_record)
    contract = _upsert(
        session,
        ApiContractVersion,
        {"version": "v1"},
        {"version": "v1", "compatibility_status": "active", "notes": "Phase 1 read contract"},
    )
    session.add(contract)
    ensure_default_policy(session, workspace.id)
    session.flush()
    return {"workspace": workspace, "sources": sources_by_key, "manifest": manifest}


def seed_database(session: Session) -> dict[str, int | str]:
    result = seed_workspace(session)
    session.commit()
    return {"workspace_id": result["workspace"].id, "sources": len(result["sources"]), "documents": len(result["manifest"]["documents"])}


def main() -> None:
    get_settings().validate_runtime()
    with SessionLocal() as session:
        result = seed_database(session)
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
