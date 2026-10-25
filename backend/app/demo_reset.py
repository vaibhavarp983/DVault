"""Destructive, development-only reset of the synthetic demo workspace."""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.demo_failures import DemoProblem
from app.demo_projection import ensure_demo_projections
from app.demo_seed import ensure_demo_portal_state, ensure_demo_rights_state, ensure_demo_user_state
from app.evidence import create_checkpoint
from app.ingestion import ingest_file
from app.models import (
    AuditCheckpoint,
    AuditEvent,
    AuditVerification,
    AuthorizationRecord,
    BreachAffectedSource,
    BreachAffectedSubject,
    BreachIncident,
    Campaign,
    CampaignRecipient,
    Conversation,
    ConversationMessage,
    DataQualityFinding,
    DataRecordRef,
    DatasetImport,
    DemoCustomer,
    DemoFailureLog,
    Document,
    DocumentExtraction,
    FixtureManifest,
    IdentityToken,
    ImportFieldProfile,
    IntegrityIncident,
    Job,
    JobEvent,
    MatchCandidate,
    MockOutbox,
    PolicyDecision,
    RetentionHold,
    RetentionPolicy,
    RetentionRun,
    RightsAccessArtifact,
    RightsRequest,
    RightsRequestAction,
    Source,
    SuppressionRecord,
    WithdrawalTier,
    Workspace,
)
from app.policy import ensure_demo_policy_state
from app.seed import FIXTURE_DIR, seed_workspace
from app.source_store import SourceStore


def require_demo_controls() -> None:
    settings = get_settings()
    if settings.is_production or not settings.enable_demo_controls:
        raise DemoProblem("DEMO_CONTROLS_DISABLED", "Demo controls are disabled in this environment.", 403)


def _clear_workspace(db: Session, workspace: Workspace) -> list[str]:
    source_ids = list(db.scalars(select(Source.id).where(Source.workspace_id == workspace.id)))
    campaign_ids = select(Campaign.id).where(Campaign.workspace_id == workspace.id)
    request_ids = select(RightsRequest.id).where(RightsRequest.workspace_id == workspace.id)
    import_ids = select(DatasetImport.id).where(DatasetImport.workspace_id == workspace.id)
    breach_ids = select(BreachIncident.id).where(BreachIncident.workspace_id == workspace.id)

    db.execute(delete(MockOutbox).where(MockOutbox.campaign_id.in_(campaign_ids)))
    db.execute(delete(CampaignRecipient).where(CampaignRecipient.campaign_id.in_(campaign_ids)))
    db.execute(delete(Campaign).where(Campaign.workspace_id == workspace.id))
    db.execute(delete(JobEvent).where(JobEvent.job_id.in_(select(Job.id).where(Job.workspace_id == workspace.id))))
    db.execute(delete(Job).where(Job.workspace_id == workspace.id))
    db.execute(delete(RightsRequestAction).where(RightsRequestAction.rights_request_id.in_(request_ids)))
    db.execute(delete(RightsAccessArtifact).where(RightsAccessArtifact.rights_request_id.in_(request_ids)))
    db.execute(delete(ConversationMessage).where(ConversationMessage.workspace_id == workspace.id))
    db.execute(delete(Conversation).where(Conversation.workspace_id == workspace.id))
    db.execute(delete(RetentionRun).where(RetentionRun.workspace_id == workspace.id))
    db.execute(delete(RetentionPolicy).where(RetentionPolicy.workspace_id == workspace.id))
    db.execute(delete(WithdrawalTier).where(WithdrawalTier.workspace_id == workspace.id))
    db.execute(delete(RetentionHold).where(RetentionHold.workspace_id == workspace.id))
    db.execute(delete(RightsRequest).where(RightsRequest.workspace_id == workspace.id))
    db.execute(delete(BreachAffectedSource).where(BreachAffectedSource.breach_incident_id.in_(breach_ids)))
    db.execute(delete(BreachAffectedSubject).where(BreachAffectedSubject.breach_incident_id.in_(breach_ids)))
    db.execute(delete(BreachIncident).where(BreachIncident.workspace_id == workspace.id))
    db.execute(delete(IntegrityIncident).where(IntegrityIncident.workspace_id == workspace.id))
    db.execute(delete(AuditVerification).where(AuditVerification.workspace_id == workspace.id))
    db.execute(delete(AuditCheckpoint).where(AuditCheckpoint.workspace_id == workspace.id))
    db.execute(delete(AuditEvent).where(AuditEvent.workspace_id == workspace.id))
    db.execute(delete(PolicyDecision).where(PolicyDecision.workspace_id == workspace.id))
    db.execute(delete(AuthorizationRecord).where(AuthorizationRecord.workspace_id == workspace.id))
    db.execute(delete(SuppressionRecord).where(SuppressionRecord.workspace_id == workspace.id))
    db.execute(delete(DataQualityFinding).where(DataQualityFinding.workspace_id == workspace.id))
    db.execute(delete(MatchCandidate).where(MatchCandidate.workspace_id == workspace.id))
    db.execute(delete(IdentityToken).where(IdentityToken.workspace_id == workspace.id))
    db.execute(delete(DataRecordRef).where(DataRecordRef.workspace_id == workspace.id))
    db.execute(delete(ImportFieldProfile).where(ImportFieldProfile.dataset_import_id.in_(import_ids)))
    db.execute(delete(DocumentExtraction).where(DocumentExtraction.dataset_import_id.in_(import_ids)))
    db.execute(delete(DatasetImport).where(DatasetImport.workspace_id == workspace.id))
    db.execute(delete(Document).where(Document.workspace_id == workspace.id))
    db.execute(delete(FixtureManifest).where(FixtureManifest.workspace_id == workspace.id))
    db.execute(delete(DemoCustomer).where(DemoCustomer.workspace_id == workspace.id))
    db.execute(delete(DemoFailureLog).where(DemoFailureLog.workspace_id == workspace.id))
    db.execute(delete(Source).where(Source.workspace_id == workspace.id))
    db.flush()
    return source_ids


def reset_workspace(db: Session, workspace: Workspace) -> None:
    source_ids = _clear_workspace(db, workspace)
    for source_id in source_ids:
        SourceStore(source_id).reset()
    seeded = seed_workspace(db, workspace)
    db.flush()
    for document_spec in seeded["manifest"]["documents"]:
        path = FIXTURE_DIR / document_spec["source_path"]
        ingest_file(
            db,
            workspace,
            seeded["sources"][document_spec["source_key"]],
            document_spec["filename"],
            path.read_bytes(),
        )
    ensure_demo_policy_state(db, workspace.id)
    ensure_demo_rights_state(db, workspace)
    ensure_demo_portal_state(db, workspace)
    ensure_demo_user_state(db, workspace)
    ensure_demo_projections(db, workspace)
    create_checkpoint(db, workspace.id, "Reset baseline checkpoint")
    db.commit()
