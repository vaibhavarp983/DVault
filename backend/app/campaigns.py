"""Managed campaign creation, preview, and execution shared by the domain API and demo facade."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.evidence import append_event, ensure_evidence_trusted
from app.models import Campaign, CampaignRecipient, DataRecordRef, DatasetImport, MockOutbox, Workspace
from app.policy import evaluate_marketing, masked_subject_ref


class CampaignProblem(Exception):
    def __init__(self, code: str, message: str, status_code: int = 409) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code


def create_campaign(
    db: Session,
    workspace: Workspace,
    *,
    name: str,
    purpose: str,
    channel: str,
    message_template_id: str,
    dataset_import_id: str | None = None,
    record_ids: list[str] | None = None,
) -> Campaign:
    if bool(dataset_import_id) == bool(record_ids):
        raise CampaignProblem("INVALID_CAMPAIGN_RECIPIENTS", "Provide exactly one of dataset_import_id or record_ids.", 422)
    if dataset_import_id:
        imported = db.scalar(select(DatasetImport).where(
            DatasetImport.workspace_id == workspace.id,
            DatasetImport.id == dataset_import_id,
        ))
        if imported is None:
            raise CampaignProblem("IMPORT_NOT_FOUND", "The selected import was not found.", 404)
        if imported.status != "COMPLETE":
            raise CampaignProblem("IMPORT_NOT_READY", "Campaign recipients must come from a completed import.", 409)
        records = list(db.scalars(select(DataRecordRef).where(
            DataRecordRef.workspace_id == workspace.id,
            DataRecordRef.dataset_import_id == imported.id,
        )))
    else:
        records = list(db.scalars(select(DataRecordRef).where(
            DataRecordRef.workspace_id == workspace.id,
            DataRecordRef.id.in_(record_ids or []),
        )))
        if len(records) != len(set(record_ids or [])):
            raise CampaignProblem("RECORD_NOT_FOUND", "One or more campaign recipients were not found.", 404)
    if not records:
        raise CampaignProblem("CAMPAIGN_RECIPIENTS_EMPTY", "The selected campaign has no recipients.", 422)
    campaign = Campaign(
        workspace_id=workspace.id,
        name=name,
        purpose=purpose,
        channel=channel,
        message_template_id=message_template_id,
        dataset_import_id=dataset_import_id,
        status="DRAFT",
    )
    db.add(campaign)
    db.flush()
    for record in records:
        db.add(CampaignRecipient(campaign_id=campaign.id, record_ref_id=record.id, subject_ref=record.subject_ref))
    append_event(
        db,
        workspace.id,
        "CAMPAIGN_CREATED",
        {"campaign_id": campaign.id, "purpose": campaign.purpose, "channel": campaign.channel, "recipient_total": len(records)},
        entity_type="campaign",
        entity_ref=campaign.id,
    )
    db.flush()
    return campaign


def preview_campaign(db: Session, workspace: Workspace, campaign: Campaign) -> Campaign:
    if campaign.status == "EXECUTED":
        raise CampaignProblem("CAMPAIGN_ALREADY_EXECUTED", "An executed campaign cannot be previewed again.", 409)
    recipients = list(db.scalars(select(CampaignRecipient).where(CampaignRecipient.campaign_id == campaign.id)))
    for recipient in recipients:
        record = db.scalar(select(DataRecordRef).where(
            DataRecordRef.workspace_id == workspace.id,
            DataRecordRef.id == recipient.record_ref_id,
        ))
        result = evaluate_marketing(
            db,
            workspace,
            recipient.subject_ref,
            campaign.purpose,
            campaign.channel,
            record=record,
            correlation_id=f"campaign:{campaign.id}:preview:{recipient.id}",
        )
        recipient.preview_decision = result.decision
        recipient.preview_reason_codes_json = result.reason_codes
        recipient.previewed_at = result.evaluated_at
    campaign.status = "PREVIEWED"
    campaign.previewed_at = datetime.now(timezone.utc)
    summary: dict[str, int] = {}
    for recipient in recipients:
        if recipient.preview_decision:
            summary[recipient.preview_decision] = summary.get(recipient.preview_decision, 0) + 1
    append_event(
        db,
        workspace.id,
        "CAMPAIGN_PREVIEWED",
        {"campaign_id": campaign.id, "decision_summary": summary},
        entity_type="campaign",
        entity_ref=campaign.id,
    )
    db.flush()
    return campaign


def execute_campaign(db: Session, workspace: Workspace, campaign: Campaign) -> Campaign:
    ensure_evidence_trusted(db, workspace.id, "managed_dispatch")
    if campaign.status != "PREVIEWED":
        raise CampaignProblem("CAMPAIGN_PREVIEW_REQUIRED", "Campaign execution requires a completed preview.", 409)
    recipients = list(db.scalars(select(CampaignRecipient).where(CampaignRecipient.campaign_id == campaign.id)))
    outbox_total = 0
    summary: dict[str, int] = {}
    for recipient in recipients:
        record = db.scalar(select(DataRecordRef).where(
            DataRecordRef.workspace_id == workspace.id,
            DataRecordRef.id == recipient.record_ref_id,
        ))
        result = evaluate_marketing(
            db,
            workspace,
            recipient.subject_ref,
            campaign.purpose,
            campaign.channel,
            record=record,
            correlation_id=f"campaign:{campaign.id}:execute:{recipient.id}",
        )
        recipient.execution_decision = result.decision
        recipient.execution_reason_codes_json = result.reason_codes
        recipient.executed_at = result.evaluated_at
        summary[result.decision] = summary.get(result.decision, 0) + 1
        if result.decision == "ALLOW" and recipient.subject_ref:
            db.add(MockOutbox(
                workspace_id=workspace.id,
                campaign_id=campaign.id,
                campaign_recipient_id=recipient.id,
                subject_ref=recipient.subject_ref,
                masked_recipient_reference=masked_subject_ref(recipient.subject_ref),
                message_template_id=campaign.message_template_id,
                dispatch_status="QUEUED",
            ))
            outbox_total += 1
    campaign.status = "EXECUTED"
    campaign.executed_at = datetime.now(timezone.utc)
    append_event(
        db,
        workspace.id,
        "CAMPAIGN_EXECUTED",
        {"campaign_id": campaign.id, "decision_summary": summary, "outbox_total": outbox_total},
        entity_type="campaign",
        entity_ref=campaign.id,
    )
    db.flush()
    return campaign
