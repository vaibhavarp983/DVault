"""Idempotent demo-state seeding shared by the fixture CLI and the reset path."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.demo_projection import resolve_demo_subject
from app.models import AuthorizationRecord, DataRecordRef, RetentionHold, RightsRequest, Workspace, utc_now
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
    return subject
