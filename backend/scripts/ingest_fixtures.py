import json
from pathlib import Path

from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.ingestion import ingest_file
from app.models import Source, Workspace

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
    print(json.dumps(results, sort_keys=True))


if __name__ == "__main__":
    main()
