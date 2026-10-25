import json
from pathlib import Path

from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.demo_projection import ensure_demo_projections
from app.demo_seed import ensure_demo_portal_state, ensure_demo_rights_state, ensure_demo_user_state
from app.evidence import create_checkpoint
from app.ingestion import ingest_file
from app.models import AuditCheckpoint, Source, Workspace
from app.policy import ensure_demo_policy_state

FIXTURE_DIR = Path(__file__).parents[1] / "app" / "fixtures"


def main() -> None:
    get_settings().validate_runtime()
    manifest = json.loads((FIXTURE_DIR / "manifest.json").read_text(encoding="utf-8"))
    with SessionLocal() as session:
        workspace = session.scalar(select(Workspace).where(Workspace.slug == manifest["workspace"]["slug"]))
        if workspace is None:
            raise RuntimeError("Run dvault-seed before ingesting fixtures.")
        sources = {source.source_key: source for source in session.scalars(select(Source).where(Source.workspace_id == workspace.id))}
        results = []
        for document in manifest["documents"]:
            path = FIXTURE_DIR / document["source_path"]
            imported, reused = ingest_file(session, workspace, sources[document["source_key"]], document["filename"], path.read_bytes())
            results.append({"document_key": document["document_key"], "import_id": imported.id, "reused": reused, "status": imported.status})
        ensure_demo_policy_state(session, workspace.id)
        rights = ensure_demo_rights_state(session, workspace)
        portal_subject = ensure_demo_portal_state(session, workspace)
        ensure_demo_user_state(session, workspace)
        ensure_demo_projections(session, workspace)
        session.commit()
        checkpoint = session.scalar(select(AuditCheckpoint).where(
            AuditCheckpoint.workspace_id == workspace.id,
        ).order_by(AuditCheckpoint.sequence.desc()).limit(1))
        if checkpoint is None:
            checkpoint = create_checkpoint(session, workspace.id, "Synthetic demo baseline checkpoint")
            session.commit()
    print(json.dumps({"imports": results, "demo_rights": rights, "portal_subject": portal_subject, "checkpoint_sequence": checkpoint.sequence if checkpoint else None}, sort_keys=True))


if __name__ == "__main__":
    main()
