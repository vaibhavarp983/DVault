"""Idempotent demo-state seeding shared by the fixture CLI and the reset path."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.demo_projection import resolve_demo_subject
from app.messaging import BUSINESS_LABEL, add_message, create_conversation
from app.models import (
    AuthorizationRecord,
    Conversation,
    DataRecordRef,
    DemoCustomer,
    RetentionHold,
    RightsRequest,
    Workspace,
    utc_now,
)
from app.retention import ensure_policy, ensure_tiers
from app.rights import create_request, execute_request, plan_request

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


def ensure_demo_portal_state(session: Session, workspace: Workspace) -> str | None:
    subject = resolve_demo_subject(session, workspace)
    if not subject:
        return None
    now = utc_now()
    for purpose, channel in (("service", "email"), ("marketing", "whatsapp"), ("course_updates", "email")):
        existing = session.scalar(select(AuthorizationRecord).where(
            AuthorizationRecord.workspace_id == workspace.id,
            AuthorizationRecord.subject_ref == subject,
            AuthorizationRecord.purpose == purpose,
            AuthorizationRecord.status == "ACTIVE",
        ))
        if existing is None:
            session.add(AuthorizationRecord(
                workspace_id=workspace.id,
                subject_ref=subject,
                purpose=purpose,
                channel=channel,
                status="ACTIVE",
                evidence_source="synthetic personal portal seed",
                notice_version="demo-v1",
                captured_at=now,
            ))
    session.flush()
    ensure_demo_messaging_state(session, workspace, subject)
    return subject
