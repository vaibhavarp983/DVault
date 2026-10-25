"""Idempotent demo-state seeding shared by the fixture CLI and the reset path."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.demo_projection import resolve_demo_subject
from app.evidence import append_event, iso_utc
from app.messaging import BUSINESS_LABEL, add_message, create_conversation, mark_read
from app.models import (
    AuditEvent,
    AuthorizationRecord,
    Conversation,
    DataRecordRef,
    DatasetImport,
    DemoCustomer,
    Document,
    RetentionHold,
    RightsRequest,
    Source,
    SuppressionRecord,
    Workspace,
    utc_now,
)
from app.retention import ensure_policy, ensure_tiers
from app.rights import create_request, execute_request, plan_request, request_actions

DEMO_HOLD_REASON = "SYNTHETIC_RETENTION_REVIEW"
STRUCTURED_DOCUMENT_TYPES = {"crm_export", "spreadsheet"}
DEMO_CONSENT_SEED = (
    ("service", "email", 540, None),
    ("marketing", "whatsapp", 420, None),
    ("course_updates", "email", 180, 365),
)
DEMO_WITHDRAWN_CONSENT = ("analytics", "web form", 540, 45)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _event_exists(session: Session, workspace_id: str, event_type: str, entity_ref: str | None) -> bool:
    return session.scalar(select(AuditEvent.id).where(
        AuditEvent.workspace_id == workspace_id,
        AuditEvent.event_type == event_type,
        AuditEvent.entity_ref == entity_ref,
    ).limit(1)) is not None


def _append_event_once(
    session: Session,
    workspace: Workspace,
    event_type: str,
    payload: dict,
    *,
    entity_type: str,
    entity_ref: str | None,
    occurred_at: datetime | None = None,
    actor_reference: str | None = None,
) -> None:
    if _event_exists(session, workspace.id, event_type, entity_ref):
        return
    append_event(
        session,
        workspace.id,
        event_type,
        payload,
        entity_type=entity_type,
        entity_ref=entity_ref,
        occurred_at=occurred_at,
        actor_reference=actor_reference,
    )


def _demo_customer(session: Session, workspace: Workspace, subject_ref: str) -> DemoCustomer | None:
    return session.scalar(select(DemoCustomer).where(
        DemoCustomer.workspace_id == workspace.id,
        DemoCustomer.subject_ref == subject_ref,
    ))


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

    demo_subject = resolve_demo_subject(session, workspace)
    hold_subject = demo_subject or (subjects[1] if len(subjects) > 1 else subjects[0])
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
    _append_event_once(
        session,
        workspace,
        "RETENTION_HOLD_CREATED",
        {"hold_id": hold.id, "reason_code": hold.reason_code, "subject_ref": hold_subject},
        entity_type="retention_hold",
        entity_ref=hold.id,
        occurred_at=hold.created_at,
        actor_reference="rights_service",
    )

    access_subject = demo_subject or subjects[0]
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


def ensure_demo_portal_state(session: Session, workspace: Workspace) -> str | None:
    subject = resolve_demo_subject(session, workspace)
    if not subject:
        return None
    customer = _demo_customer(session, workspace, subject)
    actor = customer.display_name if customer else "customer"
    now = utc_now()
    for purpose, channel, captured_days_ago, expires_in_days in DEMO_CONSENT_SEED:
        authorization = session.scalar(select(AuthorizationRecord).where(
            AuthorizationRecord.workspace_id == workspace.id,
            AuthorizationRecord.subject_ref == subject,
            AuthorizationRecord.purpose == purpose,
            AuthorizationRecord.status == "ACTIVE",
        ))
        if authorization is None:
            authorization = AuthorizationRecord(
                workspace_id=workspace.id,
                subject_ref=subject,
                purpose=purpose,
                channel=channel,
                status="ACTIVE",
                evidence_source="synthetic personal portal seed",
                notice_version="demo-v1",
                captured_at=now - timedelta(days=captured_days_ago),
                expires_at=now + timedelta(days=expires_in_days) if expires_in_days else None,
            )
            session.add(authorization)
            session.flush()
        elif expires_in_days and authorization.expires_at is None:
            authorization.expires_at = now + timedelta(days=expires_in_days)
        _append_event_once(
            session,
            workspace,
            "AUTHORIZATION_CAPTURED",
            {
                "subject_ref": subject,
                "authorization_id": authorization.id,
                "purpose": authorization.purpose,
                "channel": authorization.channel,
                "notice_version": authorization.notice_version,
                "expires_at": iso_utc(authorization.expires_at) if authorization.expires_at else None,
            },
            entity_type="authorization",
            entity_ref=authorization.id,
            occurred_at=authorization.captured_at,
            actor_reference=actor,
        )

    purpose, channel, captured_days_ago, withdrawn_days_ago = DEMO_WITHDRAWN_CONSENT
    withdrawn_at = now - timedelta(days=withdrawn_days_ago)
    authorization = session.scalar(select(AuthorizationRecord).where(
        AuthorizationRecord.workspace_id == workspace.id,
        AuthorizationRecord.subject_ref == subject,
        AuthorizationRecord.purpose == purpose,
    ).order_by(AuthorizationRecord.created_at.desc()))
    if authorization is None:
        authorization = AuthorizationRecord(
            workspace_id=workspace.id,
            subject_ref=subject,
            purpose=purpose,
            channel=channel,
            status="WITHDRAWN",
            evidence_source="synthetic personal portal seed",
            notice_version="demo-v1",
            captured_at=now - timedelta(days=captured_days_ago),
            withdrawn_at=withdrawn_at,
        )
        session.add(authorization)
        session.flush()
        _append_event_once(
            session,
            workspace,
            "AUTHORIZATION_CAPTURED",
            {
                "subject_ref": subject,
                "authorization_id": authorization.id,
                "purpose": authorization.purpose,
                "channel": authorization.channel,
                "notice_version": authorization.notice_version,
                "expires_at": None,
            },
            entity_type="authorization",
            entity_ref=authorization.id,
            occurred_at=authorization.captured_at,
            actor_reference=actor,
        )
    if authorization.status != "WITHDRAWN":
        ensure_demo_messaging_state(session, workspace, subject)
        return subject
    suppression = session.scalar(select(SuppressionRecord).where(
        SuppressionRecord.workspace_id == workspace.id,
        SuppressionRecord.subject_ref == subject,
        SuppressionRecord.purpose == purpose,
        SuppressionRecord.status == "ACTIVE",
    ))
    if suppression is None:
        suppression = SuppressionRecord(
            workspace_id=workspace.id,
            subject_ref=subject,
            purpose=purpose,
            channel=authorization.channel,
            status="ACTIVE",
            source="personal_portal",
            effective_at=authorization.withdrawn_at or withdrawn_at,
        )
        session.add(suppression)
        session.flush()
    _append_event_once(
        session,
        workspace,
        "AUTHORIZATION_WITHDRAWN",
        {
            "subject_ref": subject,
            "authorization_id": authorization.id,
            "purpose": purpose,
            "channel": authorization.channel,
            "suppression_id": suppression.id,
            "withdrawn_at": iso_utc(authorization.withdrawn_at or withdrawn_at),
        },
        entity_type="authorization",
        entity_ref=authorization.id,
        occurred_at=authorization.withdrawn_at or withdrawn_at,
        actor_reference=actor,
    )
    session.flush()
    ensure_demo_messaging_state(session, workspace, subject)
    return subject


def ensure_demo_messaging_state(session: Session, workspace: Workspace, subject: str) -> None:
    policy = ensure_policy(session, workspace)
    ensure_tiers(session, workspace)
    if session.scalar(select(Conversation.id).where(Conversation.workspace_id == workspace.id).limit(1)) is not None:
        return
    subjects = list(dict.fromkeys(
        value for value in session.scalars(
            select(DataRecordRef.subject_ref)
            .where(DataRecordRef.workspace_id == workspace.id, DataRecordRef.subject_ref.is_not(None))
            .order_by(DataRecordRef.subject_ref)
        ) if value
    ))
    secondary = next((value for value in subjects if value != subject), None)
    if secondary is None:
        secondary = "SUBJ-DEMO-UNHELD"
        if session.scalar(select(DemoCustomer.id).where(DemoCustomer.workspace_id == workspace.id, DemoCustomer.subject_ref == secondary)) is None:
            session.add(DemoCustomer(
                workspace_id=workspace.id,
                subject_ref=secondary,
                display_name="Rohan Verma",
                company="Individual",
                email_masked="r***@example.test",
                phone_masked="******0198",
                segment="Consumer",
                status="active",
                owner="Admissions",
                location="Bengaluru",
                since=utc_now() - timedelta(days=120),
            ))
            session.flush()
    names = {
        customer.subject_ref: customer.display_name
        for customer in session.scalars(select(DemoCustomer).where(DemoCustomer.workspace_id == workspace.id))
    }
    now = utc_now()

    def send(conversation, sender: str, body: str, days_ago: float) -> None:
        add_message(
            session,
            workspace,
            conversation,
            body=body,
            sender=sender,
            author_label=BUSINESS_LABEL if sender == "BUSINESS" else names.get(conversation.subject_ref, "Customer"),
            sent_at=now - timedelta(days=days_ago),
            rules=policy.rules_json,
        )

    main_email, _ = create_conversation(
        session,
        workspace,
        subject_ref=subject,
        channel="email",
        subject_line="August batch schedule",
        sender="BUSINESS",
        author_label=BUSINESS_LABEL,
        body="Hello! The August batch timetable is now available. Let us know if the evening slot works for you.",
        sent_at=now - timedelta(days=9),
        rules=policy.rules_json,
    )
    send(main_email, "CUSTOMER", "Evening works. Could you share the reading list before Monday?", 8)
    send(main_email, "BUSINESS", "Absolutely. I have attached the reading list and the first-week plan.", 6)
    send(main_email, "CUSTOMER", "Received, thank you. One more question about the weekend doubt session.", 4)

    main_chat, _ = create_conversation(
        session,
        workspace,
        subject_ref=subject,
        channel="chat",
        subject_line="Fees receipt",
        sender="BUSINESS",
        author_label=BUSINESS_LABEL,
        body="Your fee receipt for the current term is ready.",
        sent_at=now - timedelta(days=3),
        rules=policy.rules_json,
    )
    send(main_chat, "CUSTOMER", "Got it, thank you!", 1)

    low_email, _ = create_conversation(
        session,
        workspace,
        subject_ref=secondary,
        channel="email",
        subject_line="Course brochure request",
        sender="BUSINESS",
        author_label=BUSINESS_LABEL,
        body="Sharing the course brochure you requested. Do let us know if you would like a call.",
        sent_at=now - timedelta(days=120),
        rules=policy.rules_json,
    )

    medium_chat, _ = create_conversation(
        session,
        workspace,
        subject_ref=secondary,
        channel="chat",
        subject_line="Weekend batch questions",
        sender="BUSINESS",
        author_label=BUSINESS_LABEL,
        body="The weekend batch has two seats left. Would you like the syllabus?",
        sent_at=now - timedelta(days=20),
        rules=policy.rules_json,
    )
    send(medium_chat, "CUSTOMER", "Yes please. Is the fee the same as the weekday batch?", 18)
    send(medium_chat, "BUSINESS", "The fee is slightly lower and includes the practice workbook.", 16)

    high_email, _ = create_conversation(
        session,
        workspace,
        subject_ref=secondary,
        channel="email",
        subject_line="Placement follow-up",
        sender="BUSINESS",
        author_label=BUSINESS_LABEL,
        body="Checking in after the assessment. Your results are ready for review.",
        sent_at=now - timedelta(days=10),
        rules=policy.rules_json,
    )
    send(high_email, "CUSTOMER", "Thanks. I would like to discuss the feedback this week.", 8)
    send(high_email, "BUSINESS", "Of course. I can do Thursday after 5pm or Friday morning.", 6)
    send(high_email, "CUSTOMER", "Thursday after 5pm works for me.", 4)
    send(high_email, "BUSINESS", "Booked. I will send the meeting link separately.", 2)


def ensure_demo_user_profile(session: Session, workspace: Workspace, subject: str) -> None:
    customer = _demo_customer(session, workspace, subject)
    if customer is None:
        return
    if not customer.location:
        customer.location = "Bengaluru"
    since = _as_utc(customer.since)
    if since is None or (utc_now() - since).days < 30:
        customer.since = utc_now() - timedelta(days=540)
    session.flush()


def ensure_demo_user_documents(session: Session, workspace: Workspace, subject: str) -> int:
    """Attach the text fixture library to the personal identity so every document kind appears."""
    linked_imports = set(session.scalars(select(DataRecordRef.dataset_import_id).where(
        DataRecordRef.workspace_id == workspace.id,
        DataRecordRef.subject_ref == subject,
    )))
    imports = list(session.scalars(select(DatasetImport).where(
        DatasetImport.workspace_id == workspace.id,
        DatasetImport.status == "COMPLETE",
    )))
    linked = 0
    for import_row in imports:
        if import_row.id in linked_imports:
            continue
        document = session.scalar(select(Document).where(Document.id == import_row.document_id)) if import_row.document_id else None
        if document is None or document.document_type in STRUCTURED_DOCUMENT_TYPES:
            continue
        records = list(session.scalars(select(DataRecordRef).where(
            DataRecordRef.dataset_import_id == import_row.id,
        ).order_by(DataRecordRef.created_at)))
        if not records:
            continue
        record = records[0]
        if record.subject_ref is None:
            record.subject_ref = subject
            record.record_type = "text_document"
            record.match_status = "MATCHED"
            record.field_metadata_json = {**(record.field_metadata_json or {}), "linked_by": "demo_user_seed"}
            linked += 1
        if document.primary_subject_ref is None:
            document.primary_subject_ref = subject
    customer = _demo_customer(session, workspace, subject)
    if customer is not None:
        customer.source_ids_json = sorted(set(session.scalars(select(DataRecordRef.source_id).where(
            DataRecordRef.workspace_id == workspace.id,
            DataRecordRef.subject_ref == subject,
        ))))
    session.flush()
    return linked


def _ensure_request(
    session: Session,
    workspace: Workspace,
    subject: str,
    idempotency_key: str,
    request_type: str,
    *,
    plan: bool = True,
    execute: bool = False,
    correction: dict | None = None,
) -> RightsRequest:
    request, _ = create_request(session, workspace, subject, request_type, idempotency_key, "personal_portal", correction)
    if plan and request.status == "CREATED" and not request_actions(session, request.id):
        plan_request(session, workspace, request)
    if execute and request.status not in {"COMPLETE", "FAILED", "PARTIAL", "NEEDS_REVIEW"}:
        execute_request(session, workspace, request)
    return request


def _age_request(request: RightsRequest, submitted_days_ago: int, due_in_days: int) -> None:
    now = utc_now()
    request.created_at = now - timedelta(days=submitted_days_ago)
    request.due_at = now + timedelta(days=due_in_days)


def _ensure_failed_request(session: Session, workspace: Workspace, subject: str) -> RightsRequest:
    request, _ = create_request(session, workspace, subject, "ACCESS", "demo:user:access-retry", "personal_portal")
    if request.status in {"COMPLETE", "FAILED", "PARTIAL"}:
        return request
    if request.status in {"CREATED", "NEEDS_REVIEW"}:
        plan_request(session, workspace, request)
    if not request_actions(session, request.id):
        return request
    source_ids = set(session.scalars(select(DataRecordRef.source_id).where(
        DataRecordRef.workspace_id == workspace.id,
        DataRecordRef.subject_ref == subject,
    )))
    sources = list(session.scalars(select(Source).where(
        Source.workspace_id == workspace.id,
        Source.id.in_(source_ids),
    )))
    originals = {source.id: dict(source.configuration_metadata or {}) for source in sources}
    try:
        for source in sources:
            source.configuration_metadata = {**(source.configuration_metadata or {}), "phase4_failure": True}
        session.flush()
        execute_request(session, workspace, request)
    finally:
        for source in sources:
            source.configuration_metadata = originals[source.id]
        session.flush()
    return request


def ensure_demo_user_requests(session: Session, workspace: Workspace, subject: str) -> None:
    now = utc_now()
    _ensure_request(session, workspace, subject, "demo:user:portability", "PORTABILITY", execute=True)
    _ensure_request(session, workspace, subject, "demo:user:erasure", "ERASURE", execute=True)
    objection = _ensure_request(session, workspace, subject, "demo:user:objection", "WITHDRAWAL")
    _age_request(objection, 6, 24)
    rectification, _ = create_request(
        session,
        workspace,
        subject,
        "RECTIFICATION",
        "demo:user:rectification",
        "personal_portal",
        {"field": "email", "requested_value": "aarav.updated@example.test", "reason": "Requested from the personal portal"},
    )
    if rectification.status == "CREATED":
        _age_request(rectification, 45, -15)
    failed = _ensure_failed_request(session, workspace, subject)
    _age_request(failed, 12, 18)
    session.flush()


def _ensure_thread(
    session: Session,
    workspace: Workspace,
    subject: str,
    customer_name: str,
    channel: str,
    subject_line: str,
    messages: list[tuple[str, str, float]],
    *,
    read_for_customer: bool = True,
    read_for_business: bool = True,
) -> Conversation | None:
    existing = session.scalar(select(Conversation).where(
        Conversation.workspace_id == workspace.id,
        Conversation.subject_ref == subject,
        Conversation.channel == channel,
        Conversation.subject_line == subject_line,
    ))
    if existing is not None:
        return existing
    policy = ensure_policy(session, workspace)
    now = utc_now()
    sender, body, days_ago = messages[0]
    conversation, _ = create_conversation(
        session,
        workspace,
        subject_ref=subject,
        channel=channel,
        subject_line=subject_line,
        sender=sender,
        author_label=BUSINESS_LABEL if sender == "BUSINESS" else customer_name,
        body=body,
        sent_at=now - timedelta(days=days_ago),
        rules=policy.rules_json,
    )
    for sender, body, days_ago in messages[1:]:
        add_message(
            session,
            workspace,
            conversation,
            body=body,
            sender=sender,
            author_label=BUSINESS_LABEL if sender == "BUSINESS" else customer_name,
            sent_at=now - timedelta(days=days_ago),
            rules=policy.rules_json,
        )
    if read_for_customer:
        mark_read(session, workspace, conversation.id, "customer")
    if read_for_business:
        mark_read(session, workspace, conversation.id, "business")
    return conversation


def ensure_demo_user_conversations(session: Session, workspace: Workspace, subject: str) -> None:
    customer = _demo_customer(session, workspace, subject)
    name = customer.display_name if customer else "Customer"
    primary = session.scalar(select(Conversation).where(
        Conversation.workspace_id == workspace.id,
        Conversation.subject_ref == subject,
        Conversation.channel == "email",
        Conversation.subject_line == "August batch schedule",
    ))
    if primary is not None:
        mark_read(session, workspace, primary.id, "customer")
        mark_read(session, workspace, primary.id, "business")
    _ensure_thread(
        session,
        workspace,
        subject,
        name,
        "email",
        "Payment plan options",
        [
            ("BUSINESS", "We can split the next term into three instalments if that helps.", 46),
            ("CUSTOMER", "That works. Please send the instalment dates.", 45),
        ],
    )
    _ensure_thread(
        session,
        workspace,
        subject,
        name,
        "chat",
        "Weekend doubt session",
        [
            ("BUSINESS", "The weekend doubt session is now open for registration.", 130),
        ],
    )
    _ensure_thread(
        session,
        workspace,
        subject,
        name,
        "chat",
        "Holiday timetable",
        [
            ("BUSINESS", "The holiday timetable starts on the 20th. Would you like the morning batch?", 24),
            ("CUSTOMER", "Yes, morning works for me.", 22),
            ("BUSINESS", "Booked. I will share the updated calendar before Friday.", 20),
        ],
        read_for_customer=False,
    )
    session.flush()


def ensure_demo_user_activity(session: Session, workspace: Workspace, subject: str) -> None:
    now = utc_now()
    import_ids = set(session.scalars(select(DataRecordRef.dataset_import_id).where(
        DataRecordRef.workspace_id == workspace.id,
        DataRecordRef.subject_ref == subject,
    )))
    source_ids = sorted(set(session.scalars(select(DataRecordRef.source_id).where(
        DataRecordRef.workspace_id == workspace.id,
        DataRecordRef.subject_ref == subject,
    ))))
    _append_event_once(
        session,
        workspace,
        "ACCESS_SOURCE_SYNCED",
        {"subject_ref": subject, "source_count": len(source_ids), "document_count": len(import_ids)},
        entity_type="demo_subject",
        entity_ref=subject,
        occurred_at=now - timedelta(days=7),
        actor_reference="Sync service",
    )
    _append_event_once(
        session,
        workspace,
        "SECURITY_ALERT_RAISED",
        {
            "subject_ref": subject,
            "reason_code": "SOURCE_CONNECTOR_BLOCKED",
            "note": "A synthetic source connector was blocked after a failed integrity check.",
        },
        entity_type="demo_subject",
        entity_ref=subject,
        occurred_at=now - timedelta(days=3),
        actor_reference="Security service",
    )
    session.flush()


def ensure_demo_user_state(session: Session, workspace: Workspace) -> dict[str, str | int | None]:
    """Seed every state the personal `/user` projection can render."""
    subject = resolve_demo_subject(session, workspace)
    if not subject:
        return {"subject_ref": None, "documents_linked": 0}
    ensure_demo_user_profile(session, workspace, subject)
    linked = ensure_demo_user_documents(session, workspace, subject)
    ensure_demo_user_requests(session, workspace, subject)
    ensure_demo_user_conversations(session, workspace, subject)
    ensure_demo_user_activity(session, workspace, subject)
    session.flush()
    return {"subject_ref": subject, "documents_linked": linked}
