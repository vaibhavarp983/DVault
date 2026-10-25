"""Persisted-state projections for the React demo: business snapshot and personal workspace."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.breach import breach_timer_state
from app.config import get_settings
from app.document_preview import build_preview
from app.evidence import audit_status, iso_utc, trusted_through_sequence
from app.models import (
    AuditCheckpoint,
    AuditEvent,
    AuditVerification,
    AuthorizationRecord,
    BreachAffectedSource,
    BreachAffectedSubject,
    BreachIncident,
    IntegrityIncident,
    Campaign,
    CampaignRecipient,
    DataRecordRef,
    DatasetImport,
    DemoCustomer,
    Document,
    DocumentExtraction,
    ImportFieldProfile,
    Job,
    JobEvent,
    MockOutbox,
    Policy,
    PolicyDecision,
    RetentionHold,
    RightsAccessArtifact,
    RightsRequest,
    RightsRequestAction,
    Source,
    SuppressionRecord,
    Workspace,
    utc_now,
)
from app.policy import masked_subject_ref
from app.privacy import mask_value
from app.rights import request_actions
from app.source_store import SourceStore

DEMO_SCHEMA_VERSION = "demo-v1"
DEMO_NOTICE = "Synthetic demonstration data. No real personal data, legal compliance claim, or live delivery is involved."

SOURCE_KINDS = {
    "crm_export": "crm",
    "spreadsheet": "forms",
    "message_export": "messaging",
    "document_library": "drive",
}

DOCUMENT_KINDS = {
    "crm_export": "crm-record",
    "spreadsheet": "spreadsheet",
    "message_export": "conversation",
    "invoice": "invoice",
    "purchase_order": "purchase-order",
    "enquiry_form": "form",
    "consent_record": "consent-record",
    "rights_request": "rights-request",
    "email": "email",
    "internal_note": "note",
    "operational_report": "report",
}

SENSITIVITY = {
    "consent_record": "restricted",
    "rights_request": "restricted",
    "crm_export": "confidential",
    "message_export": "confidential",
    "email": "confidential",
    "invoice": "confidential",
    "purchase_order": "confidential",
    "spreadsheet": "internal",
    "enquiry_form": "confidential",
    "internal_note": "internal",
    "operational_report": "internal",
}

POLICY_OUTCOMES = {"ALLOW": "allow", "DENY": "deny", "REVIEW": "review"}
CAMPAIGN_STATUS = {"DRAFT": "draft", "PREVIEWED": "ready", "EXECUTED": "complete"}
RIGHTS_TYPES = {
    "ACCESS": "access",
    "ERASURE": "erasure",
    "WITHDRAWAL": "objection",
    "PORTABILITY": "portability",
    "RECTIFICATION": "rectification",
}
RIGHTS_STATUS = {
    "CREATED": "open",
    "PLANNING": "in-progress",
    "EXECUTING": "in-progress",
    "COMPLETE": "complete",
    "PARTIAL": "partial",
    "FAILED": "failed",
    "NEEDS_REVIEW": "review",
}
ACTION_STATUS = {
    "PENDING": "pending",
    "RUNNING": "running",
    "SUCCEEDED": "complete",
    "FAILED": "failed",
    "RESTRICTED": "restricted",
}
JOB_STATUS = {
    "RUNNING": "running",
    "COMPLETE": "completed",
    "PARTIAL": "partial",
    "FAILED": "failed",
    "NEEDS_REVIEW": "review",
}

MESSAGE_TEMPLATES = {
    "course-update-v1": {
        "subject": "Course update",
        "body": "Hello, this is a synthetic course update from Aranya Coaching Centre. Reply STOP to opt out.",
    },
    "enrolment-reminder-v1": {
        "subject": "Enrolment reminder",
        "body": "A reminder about your synthetic enrolment enquiry. Contact the admissions team for details.",
    },
    "scholarship-followup-v1": {
        "subject": "Scholarship follow-up",
        "body": "Follow-up on the synthetic scholarship enquiry. The counselling team can share next steps.",
    },
}

CONSENT_CATALOG = [
    ("service", "Service delivery", True, "Required to provide the coaching service."),
    ("marketing", "Marketing messages", False, "Course offers and reminders on the selected channel."),
    ("course_updates", "Course updates", False, "Schedule, timetable, and course material updates."),
    ("analytics", "Product analytics", False, "Aggregated usage measurement for the synthetic portal."),
]


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    return iso_utc(_as_utc(value)) if value else None


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 3) if values else None


def _category(classification: str, field_name: str) -> str:
    lowered = field_name.lower()
    if classification == "DIRECT_IDENTIFIER":
        return "contact" if any(token in lowered for token in ("email", "phone", "mobile", "contact")) else "identity"
    if classification in {"PERSON_NAME", "ADDRESS", "DATE_OF_BIRTH"}:
        return "identity"
    if classification in {"FINANCIAL", "PAYMENT"}:
        return "financial"
    if classification == "HEALTH":
        return "health"
    if classification == "CONSENT":
        return "consent"
    return "operational"


def _primitive(value: str) -> str:
    mapping = {"integer": "number", "float": "number", "decimal": "number", "datetime": "date", "boolean": "boolean"}
    return mapping.get(value, "string")


def _source_kind(source: Source) -> str:
    return SOURCE_KINDS.get(source.source_type, "drive")


def _source_status(source: Source) -> str:
    status = (source.connection_status or "").lower()
    if status in {"healthy", "connected", "imported"}:
        return "connected"
    if status in {"attention", "degraded"}:
        return "degraded"
    return "disconnected"


def _source_health(source: Source) -> int:
    status = _source_status(source)
    return 92 if status == "connected" else 62 if status == "degraded" else 24


def _import_state(import_row: DatasetImport | None) -> str:
    if import_row is None:
        return "missing"
    return {
        "COMPLETE": "indexed",
        "PROCESSING": "importing",
        "RECEIVED": "queued",
        "VALIDATING": "queued",
        "FAILED": "failed",
    }.get(import_row.status, "missing")


def _review_status(value: str) -> str:
    return {"NEEDS_REVIEW": "needs-review", "REVIEWED": "reviewed"}.get(value, "auto")


def _contact_text(settings, customer: DemoCustomer, mode: str) -> tuple[str, str]:
    if mode == "synthetic" and settings.demo_show_synthetic_contacts and customer.primary_source_id and customer.primary_source_record_id:
        row = SourceStore(customer.primary_source_id).read_record(customer.primary_source_record_id) or {}
        email = next((str(row[key]).strip() for key in ("email", "email_address", "contact_email") if row.get(key)), "")
        phone = next((str(row[key]).strip() for key in ("mobile", "phone", "phone_number", "contact_number") if row.get(key)), "")
        if email or phone:
            return email, phone
    return customer.email_masked, customer.phone_masked


def _customer_payload(settings, customer: DemoCustomer, mode: str) -> dict:
    email, phone = _contact_text(settings, customer, mode)
    return {
        "id": customer.subject_ref,
        "name": customer.display_name,
        "company": customer.company,
        "email": email,
        "phone": phone,
        "location": customer.location,
        "segment": customer.segment,
        "since": _iso(customer.since),
        "status": customer.status,
        "owner": customer.owner,
        "sourceIds": list(customer.source_ids_json or []),
        "synthetic": True,
    }


def _document_rows(db: Session, import_row: DatasetImport | None) -> list[dict]:
    if import_row is None:
        return []
    return SourceStore(import_row.source_id).read_import_records(import_row.id)


def _document_preview(
    db: Session,
    document: Document,
    import_row: DatasetImport | None,
    profiles: list[ImportFieldProfile],
    mode: str,
) -> dict:
    settings = get_settings()
    synthetic = mode == "synthetic" and settings.demo_show_synthetic_contacts
    columns = [
        {"key": profile.normalized_field, "label": profile.source_field, "type": _primitive(profile.primitive_type), "classification": _category(profile.classification, profile.source_field)}
        for profile in profiles
    ]
    if document.document_type in {"crm_export", "spreadsheet"}:
        rows = _document_rows(db, import_row)
        if synthetic:
            return build_preview(document.document_type, text=None, rows=rows, columns=columns, synthetic_contacts=True)
        preview = document.preview_json or {}
        if preview.get("kind") == "table":
            return preview
        return build_preview(document.document_type, text=None, rows=rows, columns=columns, synthetic_contacts=False)
    extraction = db.scalar(select(DocumentExtraction).where(DocumentExtraction.document_id == document.id))
    if synthetic and import_row is not None:
        text = SourceStore(import_row.source_id).read_document_text(document.id)
        return build_preview(document.document_type, text=text, rows=None, columns=None, synthetic_contacts=True)
    if document.preview_json:
        return document.preview_json
    return build_preview(
        document.document_type,
        text=extraction.redacted_text_preview if extraction else None,
        rows=None,
        columns=None,
        synthetic_contacts=False,
    )


def refresh_customer_contact(db: Session, workspace: Workspace, subject_ref: str) -> None:
    customer = db.scalar(select(DemoCustomer).where(
        DemoCustomer.workspace_id == workspace.id,
        DemoCustomer.subject_ref == subject_ref,
    ))
    if customer is None or not customer.primary_source_id or not customer.primary_source_record_id:
        return
    row = SourceStore(customer.primary_source_id).read_record(customer.primary_source_record_id) or {}
    email = next((str(row[key]).strip() for key in ("email", "email_address", "contact_email") if row.get(key)), "")
    phone = next((str(row[key]).strip() for key in ("mobile", "phone", "phone_number", "contact_number") if row.get(key)), "")
    customer.email_masked = mask_value(email, "DIRECT_IDENTIFIER") if email else customer.email_masked
    customer.phone_masked = mask_value(phone, "DIRECT_IDENTIFIER") if phone else customer.phone_masked
    db.flush()


def invalidate_document_previews(db: Session, import_ids: set[str]) -> None:
    if not import_ids:
        return
    document_ids = select(DatasetImport.document_id).where(DatasetImport.id.in_(import_ids))
    documents = list(db.scalars(select(Document).where(Document.id.in_(document_ids))))
    for document in documents:
        document.preview_json = {}
    db.flush()


def ensure_demo_projections(db: Session, workspace: Workspace) -> None:
    """Backfill projections for workspaces upgraded from an earlier phase."""
    has_customers = db.scalar(select(DemoCustomer.id).where(DemoCustomer.workspace_id == workspace.id).limit(1)) is not None
    documents = list(db.scalars(select(Document).where(Document.workspace_id == workspace.id)))
    missing_previews = [document for document in documents if not document.preview_json]
    if has_customers and not missing_previews:
        return
    if not has_customers:
        rebuild_customers(db, workspace)
    if missing_previews:
        rebuild_document_previews(db, workspace)
    db.flush()


def rebuild_customers(db: Session, workspace: Workspace) -> int:
    rows = list(db.scalars(select(DataRecordRef).where(
        DataRecordRef.workspace_id == workspace.id,
        DataRecordRef.subject_ref.is_not(None),
    )))
    grouped: dict[str, list[DataRecordRef]] = defaultdict(list)
    for record in rows:
        grouped[record.subject_ref].append(record)
    existing = {customer.subject_ref: customer for customer in db.scalars(select(DemoCustomer).where(DemoCustomer.workspace_id == workspace.id))}
    count = 0
    for subject_ref, records in grouped.items():
        first = records[0]
        row = SourceStore(first.source_id).read_record(first.source_record_id) or {}
        source = db.scalar(select(Source).where(Source.id == first.source_id))
        name = next((str(row[key]).strip() for key in ("customer_name", "name", "full_name", "applicant", "contact_name") if row.get(key)), f"Subject {subject_ref[-6:].upper()}")
        company = next((str(row[key]).strip() for key in ("company", "organisation", "organization") if row.get(key)), "Individual")
        email = next((str(row[key]).strip() for key in ("email", "email_address", "contact_email") if row.get(key)), "")
        phone = next((str(row[key]).strip() for key in ("mobile", "phone", "phone_number", "contact_number") if row.get(key)), "")
        stage = next((str(row[key]).strip().lower() for key in ("legacy_status", "lead_stage", "status") if row.get(key)), "")
        status = "closed" if stage in {"archived", "closed"} else "at-risk" if stage in {"follow_up", "follow-up", "paused"} else "active"
        customer = existing.get(subject_ref)
        if customer is None:
            customer = DemoCustomer(workspace_id=workspace.id, subject_ref=subject_ref)
            db.add(customer)
        customer.display_name = name
        customer.company = company
        customer.email_masked = mask_value(email, "DIRECT_IDENTIFIER") if email else ""
        customer.phone_masked = mask_value(phone, "DIRECT_IDENTIFIER") if phone else ""
        customer.segment = "SMB" if company != "Individual" else "Consumer"
        customer.status = status
        customer.owner = str((source.configuration_metadata or {}).get("owner") if source else "Operations") or "Operations"
        customer.location = next((str(row[key]).strip() for key in ("location", "city", "region") if row.get(key)), "")
        customer.since = customer.since or _as_utc(first.created_at)
        customer.source_ids_json = sorted({record.source_id for record in records})
        customer.primary_source_id = first.source_id
        customer.primary_source_record_id = first.source_record_id
        count += 1
    db.flush()
    return count


def rebuild_document_previews(db: Session, workspace: Workspace) -> int:
    documents = list(db.scalars(select(Document).where(Document.workspace_id == workspace.id)))
    count = 0
    for document in documents:
        import_row = db.scalar(select(DatasetImport).where(
            DatasetImport.workspace_id == workspace.id,
            DatasetImport.document_id == document.id,
        ).order_by(DatasetImport.created_at.desc()))
        if import_row is None:
            continue
        profiles = list(db.scalars(select(ImportFieldProfile).where(ImportFieldProfile.dataset_import_id == import_row.id).order_by(ImportFieldProfile.ordinal)))
        records = list(db.scalars(select(DataRecordRef).where(DataRecordRef.dataset_import_id == import_row.id)))
        columns = [
            {"key": profile.normalized_field, "label": profile.source_field, "type": _primitive(profile.primitive_type), "classification": _category(profile.classification, profile.source_field)}
            for profile in profiles
        ]
        extraction = db.scalar(select(DocumentExtraction).where(DocumentExtraction.document_id == document.id))
        if document.document_type in {"crm_export", "spreadsheet"}:
            preview = build_preview(document.document_type, text=None, rows=_document_rows(db, import_row), columns=columns, synthetic_contacts=False)
        else:
            preview = build_preview(document.document_type, text=extraction.redacted_text_preview if extraction else None, rows=None, columns=None, synthetic_contacts=False)
        document.preview_json = preview
        confidences = [profile.confidence for profile in profiles if profile.confidence is not None]
        document.confidence = _mean(confidences)
        missing = [profile.source_field for profile in profiles if profile.mapping_status != "MAPPED" or profile.non_null_count == 0]
        if document.review_status != "REVIEWED":
            document.review_status = "NEEDS_REVIEW" if (document.confidence is not None and document.confidence < 0.8) or missing else "AUTO"
        subjects = Counter(record.subject_ref for record in records if record.subject_ref)
        document.primary_subject_ref = subjects.most_common(1)[0][0] if subjects else None
        count += 1
    db.flush()
    return count


def _document_payload(db: Session, document: Document, import_row: DatasetImport | None, profiles: list[ImportFieldProfile], subjects: list[str], mode: str) -> dict:
    fields = [
        {
            "field": profile.normalized_field,
            "category": _category(profile.classification, profile.source_field),
            "confidence": profile.confidence,
            "note": profile.detection_reason,
        }
        for profile in profiles
    ]
    schema = [
        {
            "field": profile.source_field,
            "type": _primitive(profile.primitive_type),
            "example": (profile.masked_samples_json or [""])[0],
            "classification": _category(profile.classification, profile.source_field),
        }
        for profile in profiles
    ]
    missing = [profile.source_field for profile in profiles if profile.mapping_status != "MAPPED" or profile.non_null_count == 0]
    preview = _document_preview(db, document, import_row, profiles, mode)
    kind = DOCUMENT_KINDS.get(document.document_type, "note")
    if preview.get("kind") == "table":
        snippet = f"{preview.get('row_count', 0)} rows · {len(preview.get('columns', []))} fields"
    elif preview.get("kind") in {"email-thread", "conversation"}:
        snippet = f"{len(preview.get('messages', []))} messages"
    elif preview.get("reference"):
        snippet = f"{preview.get('reference')} · {preview.get('status') or kind}"
    else:
        extraction = db.scalar(select(DocumentExtraction).where(DocumentExtraction.document_id == document.id))
        snippet = (extraction.redacted_text_preview[:160] if extraction else document.display_title)
    return {
        "id": document.id,
        "name": document.display_title,
        "kind": kind,
        "sourceId": document.source_id,
        "customerId": document.primary_subject_ref or (subjects[0] if subjects else None),
        "customerIds": subjects,
        "subjectCount": len(subjects),
        "sizeKb": round((import_row.byte_size / 1024) if import_row else 0, 1),
        "modifiedAt": _iso(import_row.completed_at if import_row else document.updated_at),
        "createdAt": _iso(document.document_created_at or document.created_at),
        "importState": _import_state(import_row),
        "sensitivity": SENSITIVITY.get(document.document_type, "internal"),
        "reviewStatus": _review_status(document.review_status),
        "confidence": document.confidence if document.confidence is not None else 0.9,
        "tags": [document.document_type, kind, "synthetic"],
        "snippet": snippet,
        "fields": fields,
        "schema": schema,
        "missing": missing,
        "collection": None,
        "preview": preview,
    }


def resolve_demo_subject(db: Session, workspace: Workspace) -> str | None:
    settings = get_settings()
    if settings.demo_user_subject_ref:
        found = db.scalar(select(DemoCustomer.subject_ref).where(
            DemoCustomer.workspace_id == workspace.id,
            DemoCustomer.subject_ref == settings.demo_user_subject_ref,
        ))
        if found:
            return found
    authorized = db.scalar(
        select(DemoCustomer.subject_ref)
        .join(AuthorizationRecord, AuthorizationRecord.subject_ref == DemoCustomer.subject_ref)
        .where(
            DemoCustomer.workspace_id == workspace.id,
            AuthorizationRecord.workspace_id == workspace.id,
            AuthorizationRecord.status == "ACTIVE",
        )
        .order_by(DemoCustomer.display_name)
        .limit(1)
    )
    if authorized:
        return authorized
    return db.scalar(select(DemoCustomer.subject_ref).where(DemoCustomer.workspace_id == workspace.id).order_by(DemoCustomer.display_name).limit(1))


def _audit_payload(event: AuditEvent) -> dict:
    try:
        payload = json.loads(event.canonical_payload)
    except (TypeError, ValueError):
        return {}
    return payload if isinstance(payload, dict) else {}


def build_demo_snapshot(db: Session, workspace: Workspace, contact_mode: str = "masked") -> dict:
    ensure_demo_projections(db, workspace)
    settings = get_settings()
    now = utc_now()
    sources = list(db.scalars(select(Source).where(Source.workspace_id == workspace.id).order_by(Source.display_name)))
    source_by_id = {source.id: source for source in sources}
    documents = list(db.scalars(select(Document).where(Document.workspace_id == workspace.id).order_by(Document.display_title)))
    imports = list(db.scalars(select(DatasetImport).where(DatasetImport.workspace_id == workspace.id).order_by(DatasetImport.created_at)))
    import_by_document = {row.document_id: row for row in imports if row.document_id}
    import_ids = [row.id for row in imports]
    profiles_by_import: dict[str, list[ImportFieldProfile]] = defaultdict(list)
    if import_ids:
        for profile in db.scalars(select(ImportFieldProfile).where(ImportFieldProfile.dataset_import_id.in_(import_ids)).order_by(ImportFieldProfile.ordinal)):
            profiles_by_import[profile.dataset_import_id].append(profile)
    subjects_by_import: dict[str, list[str]] = defaultdict(list)
    records = list(db.scalars(select(DataRecordRef).where(DataRecordRef.workspace_id == workspace.id)))
    for record in records:
        if record.subject_ref:
            subjects_by_import[record.dataset_import_id].append(record.subject_ref)
    customers = list(db.scalars(select(DemoCustomer).where(DemoCustomer.workspace_id == workspace.id).order_by(DemoCustomer.display_name)))
    customer_by_subject = {customer.subject_ref: customer for customer in customers}
    customer_payloads = {customer.subject_ref: _customer_payload(settings, customer, contact_mode) for customer in customers}

    document_items = []
    for document in documents:
        import_row = import_by_document.get(document.id)
        profiles = profiles_by_import.get(import_row.id, []) if import_row else []
        subjects = sorted(set(subjects_by_import.get(import_row.id, []))) if import_row else []
        document_items.append(_document_payload(db, document, import_row, profiles, subjects, contact_mode))

    policy_rows = list(db.scalars(select(PolicyDecision).where(PolicyDecision.workspace_id == workspace.id).order_by(PolicyDecision.evaluated_at.desc()).limit(200)))
    policies_by_id = {policy.id: policy for policy in db.scalars(select(Policy).where(Policy.workspace_id == workspace.id))}
    policy_items = []
    for decision in policy_rows:
        policy = policies_by_id.get(decision.policy_id)
        area = "minimisation" if "PURPOSE" in " ".join(decision.reason_codes_json or []) else "consent"
        policy_items.append({
            "id": decision.id,
            "policyName": policy.name if policy else "Managed marketing authorization",
            "area": area,
            "outcome": POLICY_OUTCOMES.get(decision.decision, "review"),
            "subject": masked_subject_ref(decision.subject_ref) if decision.subject_ref else "unknown subject",
            "customerId": decision.subject_ref,
            "documentId": None,
            "decidedAt": _iso(decision.evaluated_at),
            "explanation": ", ".join(decision.reason_codes_json or []) or "Evaluated by the active managed-marketing policy.",
            "evidence": list(decision.evaluated_rules_json or []),
        })

    active = db.scalar(select(Policy).where(Policy.workspace_id == workspace.id, Policy.status == "ACTIVE").order_by(Policy.version.desc()))
    active_policy_payload = None
    if active:
        active_policy_payload = {
            "id": active.id,
            "name": active.name,
            "version": active.version,
            "status": active.status,
            "rules": [{"key": key, "value": json.dumps(value, sort_keys=True)} for key, value in (active.rules_json or {}).items()],
        }

    campaigns = list(db.scalars(select(Campaign).where(Campaign.workspace_id == workspace.id).order_by(Campaign.created_at.desc())))
    recipients = list(db.scalars(select(CampaignRecipient).where(CampaignRecipient.campaign_id.in_([campaign.id for campaign in campaigns])))) if campaigns else []
    outbox_recipient_ids = set(db.scalars(select(MockOutbox.campaign_recipient_id).where(MockOutbox.workspace_id == workspace.id)))
    campaign_items = []
    for campaign in campaigns:
        template = MESSAGE_TEMPLATES.get(campaign.message_template_id, {"subject": campaign.message_template_id, "body": campaign.message_template_id})
        campaign_items.append({
            "id": campaign.id,
            "name": campaign.name,
            "channel": campaign.channel.lower(),
            "scheduledFor": _iso(campaign.previewed_at or campaign.created_at),
            "status": CAMPAIGN_STATUS.get(campaign.status, "draft"),
            "message": f"{template['subject']}: {template['body']}",
        })
    recipient_items = []
    for recipient in recipients:
        customer = customer_by_subject.get(recipient.subject_ref or "")
        decision = recipient.execution_decision or recipient.preview_decision
        if recipient.id in outbox_recipient_ids:
            status = "sent"
        elif recipient.execution_decision and recipient.execution_decision != "ALLOW":
            status = "held"
        else:
            status = "pending"
        recipient_items.append({
            "id": recipient.id,
            "campaignId": recipient.campaign_id,
            "customerId": recipient.subject_ref,
            "email": customer_payloads.get(recipient.subject_ref or "", {}).get("email", ""),
            "decision": {"ALLOW": "approve", "REVIEW": "review", "DENY": "block"}.get(decision or "", "review"),
            "reason": ", ".join((recipient.execution_reason_codes_json or recipient.preview_reason_codes_json or [])) or "Awaiting preview",
            "status": status,
        })

    rights_requests = list(db.scalars(select(RightsRequest).where(RightsRequest.workspace_id == workspace.id).order_by(RightsRequest.created_at.desc())))
    artifact_by_request = {artifact.rights_request_id: artifact for artifact in db.scalars(select(RightsAccessArtifact).where(RightsAccessArtifact.rights_request_id.in_([request.id for request in rights_requests])))} if rights_requests else {}
    rights_items = []
    for request in rights_requests:
        actions = request_actions(db, request.id)
        artifact = artifact_by_request.get(request.id)
        rights_items.append({
            "id": request.id,
            "reference": request.reference or f"RR-{request.created_at.year}-{request.id[:4].upper()}",
            "customerId": request.subject_ref,
            "type": RIGHTS_TYPES.get(request.request_type, "access"),
            "receivedAt": _iso(request.created_at),
            "dueAt": _iso(request.due_at or (request.created_at + timedelta(days=30))),
            "status": RIGHTS_STATUS.get(request.status, "open"),
            "sourceProgress": [
                {
                    "sourceId": action.source_id,
                    "status": ACTION_STATUS.get(action.status, "pending"),
                    "detail": action.error_message or action.result_json.get("summary") or f"{action.action_type.replace('_', ' ').title()} {action.status.lower()}",
                }
                for action in actions
            ],
            "notes": (request.summary_json or {}).get("message", ""),
            "artifact": {
                "id": artifact.id,
                "kind": artifact.kind,
                "status": artifact.status,
                "downloadUrl": f"/api/v1/workspaces/{workspace.slug}/demo/rights-requests/{request.id}/artifact/download" if artifact.kind == "PORTABILITY_BUNDLE" else None,
            } if artifact else None,
        })
    holds = list(db.scalars(select(RetentionHold).where(RetentionHold.workspace_id == workspace.id).order_by(RetentionHold.created_at.desc())))
    hold_items = [
        {
            "id": hold.id,
            "subjectRef": hold.subject_ref,
            "sourceId": hold.source_id,
            "recordRefId": hold.record_ref_id,
            "reasonCode": hold.reason_code,
            "status": hold.status,
            "expiresAt": _iso(hold.expires_at),
            "createdAt": _iso(hold.created_at),
            "reviewNote": hold.review_note,
        }
        for hold in holds
    ]

    jobs = list(db.scalars(select(Job).where(Job.workspace_id == workspace.id).order_by(Job.created_at.desc())))
    job_events: dict[str, list[JobEvent]] = defaultdict(list)
    if jobs:
        for event in db.scalars(select(JobEvent).where(JobEvent.job_id.in_([job.id for job in jobs])).order_by(JobEvent.sequence)):
            job_events[event.job_id].append(event)
    job_items = []
    for job in jobs:
        total = job.action_total or 1
        timeline = [
            {
                "at": _iso(event.created_at),
                "label": event.message,
                "tone": "danger" if event.event_type in {"ACTION_FAILED"} else "warning" if event.event_type in {"ACTION_RESTRICTED"} else "success" if event.event_type in {"JOB_COMPLETED", "ACTION_COMPLETED"} else "neutral",
            }
            for event in job_events.get(job.id, [])
        ]
        job_items.append({
            "id": job.id,
            "name": f"{job.operation.replace('_', ' ').title()} · {job.rights_request_id[:8]}",
            "kind": "rights",
            "status": JOB_STATUS.get(job.status, "running"),
            "progress": round(min(100, (job.action_completed / total) * 100)),
            "startedAt": _iso(job.started_at or job.created_at),
            "finishedAt": _iso(job.completed_at),
            "attempts": job.attempt_count,
            "maxAttempts": max(3, job.attempt_count),
            "failureSummary": job.error_message,
            "timeline": timeline,
        })
    for import_row in imports:
        timeline = [{"at": _iso(import_row.created_at), "label": "Import received", "tone": "neutral"}]
        timeline.append({"at": _iso(import_row.completed_at), "label": "Import completed" if import_row.status == "COMPLETE" else f"Import {import_row.status.lower()}", "tone": "success" if import_row.status == "COMPLETE" else "danger"})
        job_items.append({
            "id": import_row.id,
            "name": import_row.filename,
            "kind": "import",
            "status": "completed" if import_row.status == "COMPLETE" else "failed" if import_row.status == "FAILED" else "running",
            "progress": 100 if import_row.status == "COMPLETE" else 0,
            "startedAt": _iso(import_row.created_at),
            "finishedAt": _iso(import_row.completed_at),
            "attempts": 1,
            "maxAttempts": 1,
            "failureSummary": import_row.error_message,
            "timeline": timeline,
        })
    checkpoints_all = list(db.scalars(select(AuditCheckpoint).where(AuditCheckpoint.workspace_id == workspace.id).order_by(AuditCheckpoint.sequence.desc())))
    latest_verification = db.scalar(select(AuditVerification).where(AuditVerification.workspace_id == workspace.id).order_by(AuditVerification.verified_at.desc()))
    for checkpoint in checkpoints_all:
        job_items.append({
            "id": checkpoint.id,
            "name": f"Checkpoint #{checkpoint.sequence}",
            "kind": "checkpoint",
            "status": "completed",
            "progress": 100,
            "startedAt": _iso(checkpoint.created_at),
            "finishedAt": _iso(checkpoint.created_at),
            "attempts": 1,
            "maxAttempts": 1,
            "failureSummary": None,
            "timeline": [{"at": _iso(checkpoint.created_at), "label": "Checkpoint signed", "tone": "success"}],
        })
    job_items.sort(key=lambda item: item["startedAt"] or "", reverse=True)

    events = list(db.scalars(select(AuditEvent).where(AuditEvent.workspace_id == workspace.id).order_by(AuditEvent.sequence.desc()).limit(300)))
    audit_items = []
    for event in reversed(events):
        payload = _audit_payload(event)
        category = "integrity" if event.event_type.startswith(("AUDIT_", "INTEGRITY_", "BREACH_", "CHAIN_")) else "rights" if event.event_type.startswith("RIGHTS_") else "policy" if "POLICY" in event.event_type else "access" if event.event_type.startswith(("IMPORT_", "AUTHORIZATION_")) else "system"
        severity = "critical" if event.event_type.startswith(("AUDIT_VERIFICATION_FAILED", "INTEGRITY_INCIDENT_OPENED")) else "warning" if event.event_type == "CHAIN_GENESIS" else "info"
        audit_items.append({
            "id": event.id,
            "at": _iso(event.occurred_at),
            "actor": event.actor_reference or "system",
            "action": event.event_type,
            "target": event.entity_ref or payload.get("request_id") or payload.get("campaign_id") or payload.get("source_key") or "workspace",
            "category": category,
            "severity": severity,
            "hash": event.event_hash,
            "prevHash": event.previous_hash,
        })
    checkpoint_items = [
        {
            "id": checkpoint.id,
            "at": _iso(checkpoint.created_at),
            "eventsCovered": checkpoint.sequence,
            "hash": checkpoint.head_hash,
            "status": "verified" if latest_verification and latest_verification.checkpoint_status == "VALID" else "failed" if latest_verification and latest_verification.checkpoint_status in {"INVALID", "UNCHECKED"} else "pending",
        }
        for checkpoint in checkpoints_all
    ]

    status = audit_status(db, workspace.id)
    gate = status["gate"]
    verification = status["verification"]
    incidents = list(db.scalars(select(IntegrityIncident).where(
        IntegrityIncident.workspace_id == workspace.id,
    ).order_by(IntegrityIncident.detected_at.desc()).limit(50)))
    breach_rows = list(db.scalars(select(BreachIncident).where(BreachIncident.workspace_id == workspace.id).order_by(BreachIncident.detected_at.desc()).limit(50)))
    breach_items = []
    for breach in breach_rows:
        subjects = db.scalar(select(func.count(BreachAffectedSubject.id)).where(BreachAffectedSubject.breach_incident_id == breach.id)) or 0
        affected_sources = db.scalar(select(func.count(BreachAffectedSource.id)).where(BreachAffectedSource.breach_incident_id == breach.id)) or 0
        breach_items.append({
            "id": breach.id,
            "incidentRef": breach.incident_ref,
            "title": breach.title,
            "description": breach.description,
            "origin": breach.origin,
            "severity": breach.severity,
            "status": breach.status,
            "scopeStatus": breach.scope_status,
            "detectedAt": _iso(breach.detected_at),
            "assessmentDueAt": _iso(breach.assessment_due_at),
            "timerState": breach_timer_state(breach),
            "notifiable": breach.notifiable,
            "assessmentTimeliness": breach.assessment_timeliness,
            "affectedSubjects": subjects,
            "affectedSources": affected_sources,
            "notificationStatus": breach.notification_status,
            "linkedIntegrityIncidentId": breach.linked_integrity_incident_id,
        })
    integrity = {
        "status": "failed" if verification and verification.status == "FAILED" else "verified" if verification else "unverified",
        "evidenceState": verification.evidence_state if verification else "UNVERIFIED",
        "trustedThroughSequence": trusted_through_sequence(db, workspace.id),
        "failureSequence": verification.failure_sequence if verification else None,
        "reasonCode": verification.reason_code if verification else None,
        "failures": verification.failures_json if verification else [],
        "gateState": gate.state,
        "incidentId": gate.incident_id,
        "checkpointStatus": verification.checkpoint_status if verification else "MISSING",
        "verifiedAt": _iso(verification.verified_at) if verification else None,
        "disclaimer": status["disclaimer"],
        "incidents": [
            {
                "id": incident.id,
                "status": incident.status,
                "firstFailureSequence": incident.first_failure_sequence,
                "reasonCode": incident.reason_code,
                "reasonMessage": incident.reason_message,
                "detectedAt": _iso(incident.detected_at),
                "linkedBreachIncidentId": incident.linked_breach_incident_id,
            }
            for incident in incidents
        ],
        "breachCounts": status["breaches"],
    }
    settings = get_settings()
    demo_flags = {
        "failureInjectionEnabled": settings.enable_failure_injection and settings.enable_demo_controls and not settings.is_production,
        "resetAvailable": settings.enable_demo_controls and not settings.is_production,
        "syntheticContactsAvailable": settings.demo_show_synthetic_contacts and not settings.is_production,
        "userSubjectRef": resolve_demo_subject(db, workspace),
    }
    return {
        "schemaVersion": DEMO_SCHEMA_VERSION,
        "workspace": {"id": workspace.id, "ref": workspace.slug, "name": workspace.name},
        "generatedAt": _iso(now),
        "notice": DEMO_NOTICE,
        "contactMode": contact_mode,
        "customers": [_customer_payload(settings, customer, contact_mode) for customer in customers],
        "sources": [
            {
                "id": source.id,
                "name": source.display_name,
                "kind": _source_kind(source),
                "provider": source.source_type.replace("_", " ").title(),
                "status": _source_status(source),
                "lastSync": _iso(source.last_synced_at),
                "health": _source_health(source),
                "note": source.health_summary,
                "documentCount": sum(1 for document in documents if document.source_id == source.id),
            }
            for source in sources
        ],
        "documents": document_items,
        "policies": policy_items,
        "activePolicy": active_policy_payload,
        "campaigns": campaign_items,
        "campaignRecipients": recipient_items,
        "rightsRequests": rights_items,
        "rightsHolds": hold_items,
        "jobs": job_items,
        "auditEvents": audit_items,
        "checkpoints": checkpoint_items,
        "integrity": integrity,
        "breaches": breach_items,
        "demo": demo_flags,
    }


def build_user_workspace(db: Session, workspace: Workspace, subject_ref: str | None, contact_mode: str = "masked") -> dict:
    ensure_demo_projections(db, workspace)
    settings = get_settings()
    subject = subject_ref or resolve_demo_subject(db, workspace)
    if not subject:
        return {"generatedAt": _iso(utc_now()), "notice": DEMO_NOTICE, "contactMode": contact_mode, "demoSubjectRef": None, "profile": None, "sources": [], "consents": [], "documents": [], "requests": [], "activity": []}
    customer = db.scalar(select(DemoCustomer).where(DemoCustomer.workspace_id == workspace.id, DemoCustomer.subject_ref == subject))
    email, phone = _contact_text(settings, customer, contact_mode) if customer else ("", "")
    records = list(db.scalars(select(DataRecordRef).where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.subject_ref == subject)))
    source_ids = sorted({record.source_id for record in records})
    sources = []
    for source_id in source_ids:
        source = db.scalar(select(Source).where(Source.id == source_id))
        if source is None:
            continue
        count = sum(1 for record in records if record.source_id == source_id)
        category = _source_kind(source)
        sources.append({
            "id": source.id,
            "name": source.display_name,
            "provider": source.source_type.replace("_", " ").title(),
            "category": "storage" if category == "drive" else category,
            "status": _source_status(source),
            "lastSync": _iso(source.last_synced_at),
            "recordCount": count,
            "purpose": source.health_summary,
        })
    authorizations = list(db.scalars(select(AuthorizationRecord).where(AuthorizationRecord.workspace_id == workspace.id, AuthorizationRecord.subject_ref == subject)))
    suppressions = list(db.scalars(select(SuppressionRecord).where(SuppressionRecord.workspace_id == workspace.id, SuppressionRecord.subject_ref == subject, SuppressionRecord.status == "ACTIVE")))
    consents = []
    for purpose, label, required, description in CONSENT_CATALOG:
        authorization = next((row for row in authorizations if row.purpose == purpose and row.status == "ACTIVE"), None)
        suppressed = any(row.purpose == purpose for row in suppressions)
        granted = authorization is not None and not suppressed
        updated = authorization.withdrawn_at or authorization.captured_at if authorization else None
        consents.append({
            "id": f"ucns-{purpose}",
            "purpose": label,
            "description": description,
            "granted": granted if not required else True,
            "required": required,
            "updatedAt": _iso(updated or (customer.since if customer else utc_now())),
            "channel": authorization.channel if authorization else "Preference centre",
            "expiresAt": _iso(authorization.expires_at) if authorization and authorization.expires_at else None,
        })
    import_ids = sorted({record.dataset_import_id for record in records})
    documents = []
    for import_id in import_ids:
        import_row = db.scalar(select(DatasetImport).where(DatasetImport.id == import_id))
        document = db.scalar(select(Document).where(Document.id == import_row.document_id)) if import_row and import_row.document_id else None
        if document is None:
            continue
        preview = _document_preview(db, document, import_row, list(db.scalars(select(ImportFieldProfile).where(ImportFieldProfile.dataset_import_id == import_id))), contact_mode)
        kind = {"invoice": "invoice", "purchase_order": "invoice", "consent_record": "consent", "email": "message", "message_export": "message", "enquiry_form": "form", "internal_note": "note", "operational_report": "note", "rights_request": "form", "crm_export": "account", "spreadsheet": "account"}.get(document.document_type, "account")
        fields = [
            {"field": profile.normalized_field, "category": _category(profile.classification, profile.source_field), "confidence": profile.confidence}
            for profile in db.scalars(select(ImportFieldProfile).where(ImportFieldProfile.dataset_import_id == import_id))
        ][:12]
        documents.append({
            "id": document.id,
            "name": document.display_title,
            "kind": kind,
            "sourceId": document.source_id,
            "updatedAt": _iso(import_row.completed_at if import_row else document.updated_at),
            "sizeKb": round((import_row.byte_size / 1024) if import_row else 0, 1),
            "sensitivity": "restricted" if document.document_type in {"consent_record", "rights_request"} else "confidential",
            "summary": preview.get("reference") or (f"{len(preview.get('messages', []))} messages" if preview.get("messages") else document.display_title),
            "heldSince": _iso(document.created_at),
            "retention": "Synthetic demo retention",
            "fields": fields,
        })
    requests = list(db.scalars(select(RightsRequest).where(RightsRequest.workspace_id == workspace.id, RightsRequest.subject_ref == subject).order_by(RightsRequest.created_at.desc())))
    request_items = []
    for request in requests:
        actions = request_actions(db, request.id)
        status = RIGHTS_STATUS.get(request.status, "open")
        phone_status = "complete" if status == "complete" else "failed" if status == "failed" else "in-progress" if status in {"in-progress", "partial", "review"} else "open"
        request_items.append({
            "id": request.id,
            "reference": request.reference or f"U-{request.id[:4].upper()}",
            "type": RIGHTS_TYPES.get(request.request_type, "access"),
            "submittedAt": _iso(request.created_at),
            "dueAt": _iso(request.due_at or (request.created_at + timedelta(days=30))),
            "status": phone_status,
            "steps": [
                {"id": "submitted", "label": "Submitted", "status": "complete"},
                {"id": "identity", "label": "Identity verified", "status": "complete"},
                {"id": "sources", "label": "Sources collected", "status": "complete" if actions else "failed" if request.status in {"NEEDS_REVIEW", "FAILED"} else "in-progress", "detail": f"{len(actions)} source actions"},
                {"id": "review", "label": "Review", "status": "in-progress" if request.status == "NEEDS_REVIEW" else "complete"},
                {"id": "delivery", "label": "Response delivered", "status": "complete" if request.status == "COMPLETE" else "failed" if request.status == "FAILED" else "in-progress"},
            ],
            "resolution": (request.summary_json or {}).get("message") if request.status in {"COMPLETE", "PARTIAL", "FAILED", "NEEDS_REVIEW"} else None,
        })
    activity = []
    for event in db.scalars(select(AuditEvent).where(AuditEvent.workspace_id == workspace.id).order_by(AuditEvent.recorded_at.desc()).limit(200)):
        payload = _audit_payload(event)
        if payload.get("subject_ref") != subject:
            continue
        activity.append({
            "id": event.id,
            "at": _iso(event.occurred_at),
            "action": event.event_type.replace("_", " ").title(),
            "actor": event.actor_reference or "DVault",
            "category": "consent" if "AUTHORIZATION" in event.event_type else "request" if event.event_type.startswith("RIGHTS_") else "access" if event.event_type.startswith("IMPORT_") else "system",
            "severity": "warning" if "WITHDRAWN" in event.event_type else "info",
        })
        if len(activity) >= 50:
            break
    return {
        "generatedAt": _iso(utc_now()),
        "notice": DEMO_NOTICE,
        "contactMode": contact_mode,
        "demoSubjectRef": subject,
        "profile": {
            "id": subject,
            "name": customer.display_name if customer else f"Subject {subject[-6:].upper()}",
            "email": email,
            "phone": phone,
            "location": customer.location if customer else "",
            "memberSince": _iso(customer.since) if customer else None,
            "synthetic": True,
        },
        "sources": sources,
        "consents": consents,
        "documents": documents,
        "requests": request_items,
        "activity": activity,
    }
