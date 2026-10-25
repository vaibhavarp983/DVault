import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.evidence import create_checkpoint
from app.ingestion import ingest_file
from app.models import AuditCheckpoint, DataRecordRef, RetentionHold, RightsRequest, Source, Workspace
from app.policy import ensure_demo_policy_state
from app.rights import create_request, execute_request, plan_request

FIXTURE_DIR = Path(__file__).parents[1] / "app" / "fixtures"
DEMO_HOLD_REASON = "SYNTHETIC_RETENTION_REVIEW"


def ensure_demo_rights_state(session: Session, workspace: Workspace) -> dict[str, str | None]:
    """Seed one visible retention hold and one completed access request, idempotently."""
    subjects = list(dict.fromkeys(
        value for value in session.scalars(
            select(DataRecordRef.subject_ref)
            .where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.subject_ref.is_not(None))
            .order_by(DataRecordRef.subject_ref)
        ) if value
    ))
    if not subjects:
        return {"hold_id": None, "access_request_id": None}

    hold_subject = subjects[1] if len(subjects) > 1 else subjects[0]
    hold = session.scalar(select(RetentionHold).where(
        RetentionHold.workspace_id == workspace.id,
        RetentionHold.subject_ref == hold_subject,
        RetentionHold.reason_code == DEMO_HOLD_REASON,
        RetentionHold.status == "ACTIVE",
    ))
    if hold is None:
        hold = RetentionHold(
            workspace_id=workspace.id,
            subject_ref=hold_subject,
            status="ACTIVE",
            reason_code=DEMO_HOLD_REASON,
            review_note="Synthetic demo hold: erasure must route to review rather than report deletion.",
        )
        session.add(hold)
        session.flush()

    access_subject = subjects[0]
    access_key = f"demo:access:{access_subject}"
    existing = session.scalar(select(RightsRequest).where(
        RightsRequest.workspace_id == workspace.id,
        RightsRequest.idempotency_key == access_key,
    ))
    if existing is None:
        request, _ = create_request(session, workspace, access_subject, "ACCESS", access_key, "synthetic demo access request")
        plan_request(session, workspace, request)
        execute_request(session, workspace, request)
        session.flush()
        request_id = request.id
    else:
        request_id = existing.id

    return {"hold_id": hold.id, "hold_subject": hold_subject, "access_request_id": request_id, "access_subject": access_subject}


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
        session.commit()
        checkpoint = session.scalar(select(AuditCheckpoint).where(
            AuditCheckpoint.workspace_id == workspace.id,
        ).order_by(AuditCheckpoint.sequence.desc()).limit(1))
        if checkpoint is None:
            checkpoint = create_checkpoint(session, workspace.id, "Synthetic demo baseline checkpoint")
            session.commit()
    print(json.dumps({"imports": results, "demo_rights": rights, "checkpoint_sequence": checkpoint.sequence if checkpoint else None}, sort_keys=True))


if __name__ == "__main__":
    main()
