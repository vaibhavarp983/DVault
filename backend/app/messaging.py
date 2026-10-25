"""Cross-portal conversations with per-thread hash chains and tamper detection."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.evidence import GENESIS_HASH, append_event, canonical_json, iso_utc, sha256_hex
from app.models import (
    Conversation,
    ConversationMessage,
    DemoCustomer,
    RetentionHold,
    Workspace,
    new_id,
    utc_now,
)

MESSAGE_SCHEMA = "dvault-message-v1"
CHANNELS = {"email", "chat"}
SENDERS = {"BUSINESS", "CUSTOMER", "SYSTEM"}
RETENTION_STATES = {"FULL", "METADATA", "PURGED"}
BUSINESS_LABEL = "Aranya Coaching Centre"


class MessagingProblem(Exception):
    def __init__(self, code: str, message: str, status_code: int = 409) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code


def _conversation(db: Session, workspace: Workspace, conversation_id: str) -> Conversation:
    conversation = db.scalar(select(Conversation).where(
        Conversation.workspace_id == workspace.id,
        Conversation.id == conversation_id,
    ))
    if conversation is None:
        raise MessagingProblem("CONVERSATION_NOT_FOUND", "The conversation was not found.", 404)
    return conversation


def resolve_conversation(db: Session, workspace: Workspace, conversation_id: str) -> Conversation:
    return _conversation(db, workspace, conversation_id)


def _customer(db: Session, workspace: Workspace, subject_ref: str) -> DemoCustomer:
    customer = db.scalar(select(DemoCustomer).where(
        DemoCustomer.workspace_id == workspace.id,
        DemoCustomer.subject_ref == subject_ref,
    ))
    if customer is None:
        raise MessagingProblem("DEMO_SUBJECT_NOT_FOUND", "The selected customer was not found.", 404)
    return customer


def hold_active(db: Session, workspace_id: str, subject_ref: str) -> bool:
    hold = db.scalar(select(RetentionHold).where(
        RetentionHold.workspace_id == workspace_id,
        RetentionHold.subject_ref == subject_ref,
        RetentionHold.status == "ACTIVE",
    ).limit(1))
    if hold is None:
        return False
    return hold.expires_at is None or _as_utc(hold.expires_at) > utc_now()


def _thread_key(channel: str, subject_ref: str, subject_line: str) -> str:
    return f"{channel}:{subject_ref}:{sha256_hex(subject_line.strip().lower())[:20]}"


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _classify(count: int, last_activity: datetime, rules: dict | None, now: datetime | None = None) -> str:
    current = _as_utc(now or utc_now())
    config = rules or {}
    active_days = int(config.get("activeDays", 14))
    medium_days = int(config.get("mediumDays", 90))
    high_min = int(config.get("highMinMessages", 5))
    medium_min = int(config.get("mediumMinMessages", 2))
    age = current - _as_utc(last_activity)
    if age <= timedelta(days=active_days) or count >= high_min:
        return "HIGH"
    if age <= timedelta(days=medium_days) or count >= medium_min:
        return "MEDIUM"
    return "LOW"


def refresh_metrics(
    db: Session,
    conversation: Conversation,
    rules: dict | None = None,
    now: datetime | None = None,
) -> None:
    messages = list(db.scalars(select(ConversationMessage).where(
        ConversationMessage.conversation_id == conversation.id,
    )))
    conversation.message_count = len(messages)
    conversation.last_activity_at = max(
        (_as_utc(message.sent_at) for message in messages),
        default=_as_utc(conversation.created_at),
    )
    conversation.interaction_level = _classify(
        conversation.message_count,
        conversation.last_activity_at,
        rules,
        now,
    )
    conversation.updated_at = now or utc_now()


def _message_hash(
    workspace_id: str,
    conversation: Conversation,
    message_id: str,
    channel: str,
    direction: str,
    sender: str,
    sent_at: datetime,
    body_sha256: str,
    subject_sha256: str,
    previous_hash: str,
) -> str:
    return sha256_hex(canonical_json({
        "schema": MESSAGE_SCHEMA,
        "workspace_id": workspace_id,
        "conversation_id": conversation.id,
        "message_id": message_id,
        "channel": channel,
        "direction": direction,
        "sender": sender,
        "sent_at": iso_utc(sent_at),
        "body_sha256": body_sha256,
        "subject_sha256": subject_sha256,
        "previous_hash": previous_hash,
    }))


def create_conversation(
    db: Session,
    workspace: Workspace,
    *,
    subject_ref: str,
    channel: str,
    subject_line: str,
    sender: str,
    author_label: str,
    body: str,
    sent_at: datetime | None = None,
    direction: str | None = None,
    rules: dict | None = None,
) -> tuple[Conversation, ConversationMessage]:
    normalized = channel.strip().lower()
    if normalized not in CHANNELS:
        raise MessagingProblem("CONVERSATION_CHANNEL_INVALID", "channel must be email or chat.", 422)
    if not subject_ref.strip():
        raise MessagingProblem("CONVERSATION_SUBJECT_REQUIRED", "A customer is required.", 422)
    if not body.strip():
        raise MessagingProblem("MESSAGE_BODY_REQUIRED", "A message body is required.", 422)
    _customer(db, workspace, subject_ref)
    now = utc_now()
    key = _thread_key(normalized, subject_ref, subject_line)
    conversation = db.scalar(select(Conversation).where(
        Conversation.workspace_id == workspace.id,
        Conversation.thread_key == key,
    ))
    if conversation is None:
        conversation = Conversation(
            id=new_id(),
            workspace_id=workspace.id,
            subject_ref=subject_ref,
            channel=normalized,
            subject_line=subject_line.strip()[:240],
            thread_key=key,
            status="OPEN",
            interaction_level="LOW",
            retention_class="FULL",
            integrity_state="VERIFIED",
            message_count=0,
            last_activity_at=sent_at or now,
            created_at=now,
            updated_at=now,
        )
        db.add(conversation)
        db.flush()
    elif conversation.status == "ARCHIVED":
        conversation.status = "OPEN"
    message = add_message(
        db,
        workspace,
        conversation,
        body=body,
        subject_line=subject_line,
        sender=sender,
        author_label=author_label,
        direction=direction,
        sent_at=sent_at,
        rules=rules,
    )
    return conversation, message


def add_message(
    db: Session,
    workspace: Workspace,
    conversation: Conversation,
    *,
    body: str,
    sender: str,
    author_label: str,
    subject_line: str | None = None,
    direction: str | None = None,
    sent_at: datetime | None = None,
    rules: dict | None = None,
) -> ConversationMessage:
    if not body.strip():
        raise MessagingProblem("MESSAGE_BODY_REQUIRED", "A message body is required.", 422)
    normalized_sender = sender.strip().upper()
    if normalized_sender not in SENDERS:
        raise MessagingProblem("MESSAGE_SENDER_INVALID", "The message sender is not recognised.", 422)
    resolved_direction = (direction or ("OUTBOUND" if normalized_sender == "BUSINESS" else "INBOUND")).upper()
    if resolved_direction not in {"INBOUND", "OUTBOUND"}:
        raise MessagingProblem("MESSAGE_DIRECTION_INVALID", "The message direction is not recognised.", 422)
    now = utc_now()
    occurred = sent_at or now
    last = db.scalar(select(ConversationMessage).where(
        ConversationMessage.conversation_id == conversation.id,
    ).order_by(ConversationMessage.sequence.desc()).limit(1))
    sequence = (last.sequence + 1) if last else 1
    previous_hash = last.message_hash if last else GENESIS_HASH
    message_id = new_id()
    resolved_subject = (subject_line if subject_line is not None else conversation.subject_line) or ""
    body_sha256 = sha256_hex(body)
    subject_sha256 = sha256_hex(resolved_subject)
    message = ConversationMessage(
        id=message_id,
        workspace_id=workspace.id,
        conversation_id=conversation.id,
        sequence=sequence,
        direction=resolved_direction,
        sender=normalized_sender,
        author_label=author_label[:160],
        subject_line=resolved_subject[:240],
        body=body,
        body_sha256=body_sha256,
        subject_sha256=subject_sha256,
        previous_hash=previous_hash,
        message_hash=_message_hash(
            workspace.id,
            conversation,
            message_id,
            conversation.channel,
            resolved_direction,
            normalized_sender,
            occurred,
            body_sha256,
            subject_sha256,
            previous_hash,
        ),
        sent_at=occurred,
        recorded_at=now,
        retention_state="FULL",
        tamper_state="VERIFIED",
    )
    db.add(message)
    db.flush()
    refresh_metrics(db, conversation, rules, now)
    if last is None:
        conversation.retention_class = "FULL"
    db.flush()
    append_event(
        db,
        workspace.id,
        "MESSAGE_RECORDED",
        {
            "message_id": message.id,
            "conversation_id": conversation.id,
            "subject_ref": conversation.subject_ref,
            "channel": conversation.channel,
            "direction": message.direction,
            "sender": message.sender,
            "sequence": message.sequence,
            "body_sha256": message.body_sha256,
            "subject_sha256": message.subject_sha256,
            "previous_hash": message.previous_hash,
            "message_hash": message.message_hash,
        },
        entity_type="conversation_message",
        entity_ref=message.id,
        occurred_at=occurred,
        actor_reference=normalized_sender.lower(),
    )
    return message


def business_send(
    db: Session,
    workspace: Workspace,
    conversation_id: str,
    body: str,
    rules: dict | None = None,
) -> ConversationMessage:
    conversation = _conversation(db, workspace, conversation_id)
    return add_message(
        db,
        workspace,
        conversation,
        body=body,
        sender="BUSINESS",
        author_label=BUSINESS_LABEL,
        direction="OUTBOUND",
        rules=rules,
    )


def customer_send(
    db: Session,
    workspace: Workspace,
    conversation_id: str,
    subject_ref: str,
    body: str,
    rules: dict | None = None,
) -> ConversationMessage:
    conversation = _conversation(db, workspace, conversation_id)
    if conversation.subject_ref != subject_ref:
        raise MessagingProblem("CONVERSATION_FORBIDDEN", "This conversation belongs to another customer.", 403)
    customer = _customer(db, workspace, subject_ref)
    return add_message(
        db,
        workspace,
        conversation,
        body=body,
        sender="CUSTOMER",
        author_label=customer.display_name,
        direction="INBOUND",
        rules=rules,
    )


def mark_read(
    db: Session,
    workspace: Workspace,
    conversation_id: str,
    side: str,
) -> int:
    conversation = _conversation(db, workspace, conversation_id)
    now = utc_now()
    messages = list(db.scalars(select(ConversationMessage).where(
        ConversationMessage.conversation_id == conversation.id,
    )))
    changed = 0
    if side == "business":
        for message in messages:
            if message.direction == "INBOUND" and message.read_by_business_at is None:
                message.read_by_business_at = now
                changed += 1
    elif side == "customer":
        for message in messages:
            if message.direction == "OUTBOUND" and message.read_by_customer_at is None:
                message.read_by_customer_at = now
                changed += 1
    else:
        raise MessagingProblem("CONVERSATION_SIDE_INVALID", "side must be business or customer.", 422)
    db.flush()
    return changed


def archive_conversation(db: Session, workspace: Workspace, conversation_id: str) -> Conversation:
    conversation = _conversation(db, workspace, conversation_id)
    conversation.status = "ARCHIVED"
    conversation.updated_at = utc_now()
    db.flush()
    return conversation


def _flag(
    db: Session,
    workspace: Workspace,
    conversation: Conversation,
    message: ConversationMessage,
    reason_code: str,
    expected_hash: str,
    actual_hash: str,
) -> None:
    already_flagged = message.tamper_state == "FLAGGED"
    message.tamper_state = "FLAGGED"
    conversation.integrity_state = "FLAGGED"
    if already_flagged:
        return
    append_event(
        db,
        workspace.id,
        "MESSAGE_CHAIN_TAMPER_DETECTED",
        {
            "message_id": message.id,
            "conversation_id": conversation.id,
            "subject_ref": conversation.subject_ref,
            "reason_code": reason_code,
            "expected_hash": expected_hash,
            "actual_hash": actual_hash,
        },
        entity_type="conversation_message",
        entity_ref=message.id,
        occurred_at=utc_now(),
        actor_reference="verification",
    )


def verify_conversation(db: Session, workspace: Workspace, conversation_id: str) -> dict:
    conversation = _conversation(db, workspace, conversation_id)
    messages = list(db.scalars(select(ConversationMessage).where(
        ConversationMessage.conversation_id == conversation.id,
    ).order_by(ConversationMessage.sequence)))
    expected_previous = GENESIS_HASH
    flagged: list[str] = []
    for message in messages:
        clean = True
        body_hash = sha256_hex(message.body or "")
        if message.retention_state == "FULL" and body_hash != message.body_sha256:
            clean = False
            _flag(
                db,
                workspace,
                conversation,
                message,
                "MESSAGE_BODY_HASH_MISMATCH",
                message.body_sha256,
                body_hash,
            )
        subject_hash = sha256_hex(message.subject_line or "")
        if subject_hash != message.subject_sha256:
            clean = False
            _flag(
                db,
                workspace,
                conversation,
                message,
                "MESSAGE_SUBJECT_HASH_MISMATCH",
                message.subject_sha256,
                subject_hash,
            )
        computed = _message_hash(
            workspace.id,
            conversation,
            message.id,
            conversation.channel,
            message.direction,
            message.sender,
            message.sent_at,
            message.body_sha256,
            message.subject_sha256,
            message.previous_hash,
        )
        if computed != message.message_hash:
            clean = False
            _flag(
                db,
                workspace,
                conversation,
                message,
                "MESSAGE_HASH_MISMATCH",
                computed,
                message.message_hash,
            )
        if message.previous_hash != expected_previous:
            clean = False
            _flag(
                db,
                workspace,
                conversation,
                message,
                "MESSAGE_CHAIN_LINK_BROKEN",
                expected_previous,
                message.previous_hash,
            )
        if clean:
            message.tamper_state = "VERIFIED"
        else:
            flagged.append(message.id)
        expected_previous = message.message_hash
    conversation.integrity_state = "FLAGGED" if flagged else "VERIFIED"
    conversation.updated_at = utc_now()
    db.flush()
    return {
        "conversationId": conversation.id,
        "status": "flagged" if flagged else "verified",
        "messageTotal": len(messages),
        "flaggedMessageIds": flagged,
        "headHash": messages[-1].message_hash if messages else GENESIS_HASH,
    }


def verify_all(db: Session, workspace: Workspace, subject_ref: str | None = None) -> dict:
    query = select(Conversation).where(Conversation.workspace_id == workspace.id)
    if subject_ref:
        query = query.where(Conversation.subject_ref == subject_ref)
    conversations = list(db.scalars(query.order_by(Conversation.created_at)))
    flagged_conversations = 0
    flagged_messages = 0
    verified = 0
    message_total = 0
    head_hash = GENESIS_HASH
    for conversation in conversations:
        messages = list(db.scalars(select(ConversationMessage).where(
            ConversationMessage.conversation_id == conversation.id,
        ).order_by(ConversationMessage.sequence)))
        message_total += len(messages)
        if messages:
            head_hash = messages[-1].message_hash
        result = verify_conversation(db, workspace, conversation.id)
        if result["status"] == "flagged":
            flagged_conversations += 1
            flagged_messages += len(result["flaggedMessageIds"])
        else:
            verified += 1
    return {
        "status": "flagged" if flagged_messages else "verified",
        "conversationTotal": len(conversations),
        "messageTotal": message_total,
        "verifiedConversations": verified,
        "flaggedConversations": flagged_conversations,
        "flaggedMessages": flagged_messages,
        "headHash": head_hash,
    }


def message_integrity_summary(db: Session, workspace: Workspace) -> dict:
    conversations = list(db.scalars(select(Conversation).where(
        Conversation.workspace_id == workspace.id,
    )))
    messages = list(db.scalars(select(ConversationMessage).where(
        ConversationMessage.workspace_id == workspace.id,
    ).order_by(ConversationMessage.sent_at, ConversationMessage.sequence)))
    flagged_messages = [message for message in messages if message.tamper_state == "FLAGGED"]
    flagged_conversations = [row for row in conversations if row.integrity_state == "FLAGGED"]
    return {
        "status": "flagged" if flagged_messages else "verified",
        "conversationTotal": len(conversations),
        "messageTotal": len(messages),
        "verifiedConversations": len(conversations) - len(flagged_conversations),
        "flaggedConversations": len(flagged_conversations),
        "flaggedMessages": len(flagged_messages),
        "headHash": messages[-1].message_hash if messages else GENESIS_HASH,
    }
