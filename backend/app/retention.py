"""Policy-driven message retention, interaction tiers, and withdrawal effects."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.evidence import append_event, iso_utc
from app.messaging import hold_active, refresh_metrics
from app.models import (
    Conversation,
    ConversationMessage,
    RetentionPolicy,
    RetentionRun,
    WithdrawalTier,
    Workspace,
    new_id,
    utc_now,
)

DEFAULT_RULES = {
    "activeDays": 14,
    "mediumDays": 90,
    "highMinMessages": 5,
    "mediumMinMessages": 2,
    "actions": {
        "HIGH": "FULL",
        "MEDIUM": "METADATA",
        "LOW": "PURGED",
    },
}

DEFAULT_TIERS = [
    {
        "key": "marketing-only",
        "label": "Marketing only",
        "description": "Stop marketing and analytics use. Conversation content is retained.",
        "purposes": ["marketing", "analytics"],
        "effect": "KEEP_ALL",
        "display_order": 0,
    },
    {
        "key": "all-optional",
        "label": "All optional consent",
        "description": "Withdraw every optional purpose and reduce low-interaction message content.",
        "purposes": ["marketing", "course_updates", "analytics"],
        "effect": "REDUCE_LOW",
        "display_order": 1,
    },
    {
        "key": "full-withdrawal",
        "label": "Full optional withdrawal",
        "description": "Withdraw every optional purpose and remove low and medium-interaction message content.",
        "purposes": ["marketing", "course_updates", "analytics"],
        "effect": "PURGE_LOW_MEDIUM",
        "display_order": 2,
    },
]

ACTION_RANK = {"PURGED": 0, "METADATA": 1, "FULL": 2}
TIER_EFFECTS = {"KEEP_ALL", "REDUCE_LOW", "PURGE_LOW_MEDIUM"}


class RetentionProblem(Exception):
    def __init__(self, code: str, message: str, status_code: int = 409) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code


def active_policy(db: Session, workspace: Workspace) -> RetentionPolicy:
    policy = db.scalar(select(RetentionPolicy).where(
        RetentionPolicy.workspace_id == workspace.id,
        RetentionPolicy.active.is_(True),
    ).order_by(RetentionPolicy.version.desc()).limit(1))
    if policy is None:
        policy = RetentionPolicy(
            id=new_id(),
            workspace_id=workspace.id,
            version=1,
            active=True,
            rules_json=DEFAULT_RULES,
            updated_by="demo_seed",
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        db.add(policy)
        db.flush()
    return policy


def ensure_policy(db: Session, workspace: Workspace) -> RetentionPolicy:
    return active_policy(db, workspace)


def validate_rules(rules: dict) -> dict:
    try:
        active_days = int(rules.get("activeDays"))
        medium_days = int(rules.get("mediumDays"))
        high_min = int(rules.get("highMinMessages"))
        medium_min = int(rules.get("mediumMinMessages"))
        actions = {str(key).upper(): str(value).upper() for key, value in (rules.get("actions") or {}).items()}
    except (TypeError, ValueError, AttributeError) as exc:
        raise RetentionProblem("RETENTION_POLICY_INVALID", "Retention thresholds and actions must be valid.", 422) from exc
    if active_days < 1 or medium_days <= active_days:
        raise RetentionProblem("RETENTION_POLICY_INVALID", "mediumDays must be greater than activeDays.", 422)
    if high_min < 1 or medium_min < 1 or high_min < medium_min:
        raise RetentionProblem("RETENTION_POLICY_INVALID", "Message thresholds must be positive and ordered.", 422)
    if set(actions) != {"HIGH", "MEDIUM", "LOW"}:
        raise RetentionProblem("RETENTION_POLICY_INVALID", "Actions must define HIGH, MEDIUM, and LOW.", 422)
    if any(value not in ACTION_RANK for value in actions.values()):
        raise RetentionProblem("RETENTION_POLICY_INVALID", "Actions must be FULL, METADATA, or PURGED.", 422)
    if actions["HIGH"] != "FULL":
        raise RetentionProblem("RETENTION_POLICY_INVALID", "High-interaction content must be retained in full.", 422)
    if ACTION_RANK[actions["MEDIUM"]] > ACTION_RANK[actions["HIGH"]]:
        raise RetentionProblem("RETENTION_POLICY_INVALID", "Medium retention cannot exceed high retention.", 422)
    if ACTION_RANK[actions["LOW"]] > ACTION_RANK[actions["MEDIUM"]]:
        raise RetentionProblem("RETENTION_POLICY_INVALID", "Low retention cannot exceed medium retention.", 422)
    return {
        "activeDays": active_days,
        "mediumDays": medium_days,
        "highMinMessages": high_min,
        "mediumMinMessages": medium_min,
        "actions": actions,
    }


def update_policy(
    db: Session,
    workspace: Workspace,
    rules: dict,
    updated_by: str = "demo_desktop",
) -> RetentionPolicy:
    valid = validate_rules(rules)
    previous = active_policy(db, workspace)
    previous.active = False
    previous.updated_at = utc_now()
    policy = RetentionPolicy(
        id=new_id(),
        workspace_id=workspace.id,
        version=previous.version + 1,
        active=True,
        rules_json=valid,
        updated_by=updated_by,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(policy)
    db.flush()
    append_event(
        db,
        workspace.id,
        "RETENTION_POLICY_UPDATED",
        {
            "policy_version": policy.version,
            "previous_version": previous.version,
            "rules_summary": [
                f"activeDays={valid['activeDays']}",
                f"mediumDays={valid['mediumDays']}",
                f"HIGH={valid['actions']['HIGH']}",
                f"MEDIUM={valid['actions']['MEDIUM']}",
                f"LOW={valid['actions']['LOW']}",
            ],
        },
        entity_type="retention_policy",
        entity_ref=policy.id,
        occurred_at=policy.created_at,
        actor_reference=updated_by,
    )
    return policy


def ensure_tiers(db: Session, workspace: Workspace) -> list[WithdrawalTier]:
    existing = list(db.scalars(select(WithdrawalTier).where(
        WithdrawalTier.workspace_id == workspace.id,
    ).order_by(WithdrawalTier.display_order)))
    if existing:
        return existing
    tiers = []
    for spec in DEFAULT_TIERS:
        tier = WithdrawalTier(
            id=new_id(),
            workspace_id=workspace.id,
            key=spec["key"],
            label=spec["label"],
            description=spec["description"],
            purposes_json=list(spec["purposes"]),
            effect=spec["effect"],
            display_order=spec["display_order"],
            active=True,
            version=1,
            updated_at=utc_now(),
        )
        db.add(tier)
        tiers.append(tier)
    db.flush()
    return tiers


def list_tiers(db: Session, workspace: Workspace) -> list[WithdrawalTier]:
    return list(db.scalars(select(WithdrawalTier).where(
        WithdrawalTier.workspace_id == workspace.id,
    ).order_by(WithdrawalTier.display_order, WithdrawalTier.label)))


def resolve_tier(db: Session, workspace: Workspace, key: str) -> WithdrawalTier:
    tier = db.scalar(select(WithdrawalTier).where(
        WithdrawalTier.workspace_id == workspace.id,
        WithdrawalTier.key == key,
    ))
    if tier is None:
        raise RetentionProblem("WITHDRAWAL_TIER_NOT_FOUND", "The withdrawal tier was not found.", 404)
    return tier


def update_tier(
    db: Session,
    workspace: Workspace,
    key: str,
    *,
    label: str | None = None,
    description: str | None = None,
    effect: str | None = None,
    active: bool | None = None,
    display_order: int | None = None,
    purposes: list[str] | None = None,
) -> WithdrawalTier:
    tier = resolve_tier(db, workspace, key)
    if label is not None:
        if not label.strip():
            raise RetentionProblem("WITHDRAWAL_TIER_INVALID", "A tier label is required.", 422)
        tier.label = label.strip()[:160]
    if description is not None:
        tier.description = description.strip()[:500]
    if effect is not None:
        normalized = effect.strip().upper()
        if normalized not in TIER_EFFECTS:
            raise RetentionProblem("WITHDRAWAL_TIER_INVALID", "The tier effect is not recognised.", 422)
        tier.effect = normalized
    if active is not None:
        tier.active = active
    if display_order is not None:
        tier.display_order = max(0, int(display_order))
    if purposes is not None:
        cleaned = list(dict.fromkeys(str(purpose).strip().lower() for purpose in purposes if str(purpose).strip()))
        if not cleaned or "service" in cleaned:
            raise RetentionProblem("WITHDRAWAL_TIER_INVALID", "Optional purposes are required and service cannot be withdrawn.", 422)
        tier.purposes_json = cleaned
    tier.version += 1
    tier.updated_at = utc_now()
    db.flush()
    append_event(
        db,
        workspace.id,
        "WITHDRAWAL_TIER_UPDATED",
        {
            "tier_key": tier.key,
            "version": tier.version,
            "effect": tier.effect,
            "active": tier.active,
        },
        entity_type="withdrawal_tier",
        entity_ref=tier.id,
        occurred_at=tier.updated_at,
        actor_reference="demo_desktop",
    )
    return tier


def _conversation_state(conversation: Conversation, messages: list[ConversationMessage]) -> str:
    states = {message.retention_state for message in messages}
    if not states:
        return "FULL"
    if states == {"FULL"}:
        return "FULL"
    if states == {"PURGED"}:
        return "PURGED"
    if states == {"METADATA"}:
        return "METADATA"
    return "MIXED"


def sweep(
    db: Session,
    workspace: Workspace,
    *,
    trigger: str = "MANUAL",
    subject_ref: str | None = None,
    effect_override: str | None = None,
) -> RetentionRun:
    policy = active_policy(db, workspace)
    rules = validate_rules(policy.rules_json or DEFAULT_RULES)
    now = utc_now()
    run = RetentionRun(
        id=new_id(),
        workspace_id=workspace.id,
        policy_version=policy.version,
        trigger=trigger,
        started_at=now,
        scanned=0,
        retained=0,
        reduced=0,
        purged=0,
        restricted=0,
        skipped_hold=0,
        details_json=[],
    )
    db.add(run)
    db.flush()
    query = select(Conversation).where(Conversation.workspace_id == workspace.id)
    if subject_ref:
        query = query.where(Conversation.subject_ref == subject_ref)
    conversations = list(db.scalars(query.order_by(Conversation.created_at)))
    details = []
    for conversation in conversations:
        refresh_metrics(db, conversation, rules, now)
        run.scanned += 1
        if hold_active(db, workspace.id, conversation.subject_ref):
            run.skipped_hold += 1
            details.append({
                "conversation_id": conversation.id,
                "interaction_level": conversation.interaction_level,
                "action": "RESTRICTED",
                "reason": "ACTIVE_RETENTION_HOLD",
            })
            continue
        action = rules["actions"].get(conversation.interaction_level, "FULL")
        if effect_override == "REDUCE_LOW" and conversation.interaction_level == "LOW":
            action = "METADATA"
        if effect_override == "PURGE_LOW_MEDIUM" and conversation.interaction_level in {"LOW", "MEDIUM"}:
            action = "PURGED"
        messages = list(db.scalars(select(ConversationMessage).where(
            ConversationMessage.conversation_id == conversation.id,
        )))
        changed_reduced = 0
        changed_purged = 0
        for message in messages:
            if action == "FULL":
                continue
            if action == "METADATA" and message.retention_state == "FULL":
                message.body = None
                message.retention_state = "METADATA"
                message.redacted_at = now
                changed_reduced += 1
                append_event(
                    db,
                    workspace.id,
                    "MESSAGE_RETENTION_REDUCED",
                    {
                        "message_id": message.id,
                        "conversation_id": conversation.id,
                        "subject_ref": conversation.subject_ref,
                        "from_state": "FULL",
                        "to_state": "METADATA",
                        "run_id": run.id,
                    },
                    entity_type="conversation_message",
                    entity_ref=message.id,
                    occurred_at=now,
                    actor_reference="retention",
                )
            if action == "PURGED" and message.retention_state in {"FULL", "METADATA"}:
                previous_state = message.retention_state
                message.body = None
                message.retention_state = "PURGED"
                message.purged_at = now
                if message.redacted_at is None:
                    message.redacted_at = now
                changed_purged += 1
                append_event(
                    db,
                    workspace.id,
                    "MESSAGE_CONTENT_PURGED",
                    {
                        "message_id": message.id,
                        "conversation_id": conversation.id,
                        "subject_ref": conversation.subject_ref,
                        "from_state": previous_state,
                        "to_state": "PURGED",
                        "run_id": run.id,
                    },
                    entity_type="conversation_message",
                    entity_ref=message.id,
                    occurred_at=now,
                    actor_reference="retention",
                )
        conversation.retention_class = _conversation_state(conversation, messages)
        if changed_purged:
            run.purged += 1
        elif changed_reduced:
            run.reduced += 1
        else:
            run.retained += 1
        details.append({
            "conversation_id": conversation.id,
            "interaction_level": conversation.interaction_level,
            "action": action,
            "message_count": len(messages),
            "reduced": changed_reduced,
            "purged": changed_purged,
        })
    run.details_json = details
    run.finished_at = utc_now()
    db.flush()
    append_event(
        db,
        workspace.id,
        "RETENTION_SWEEP_COMPLETED",
        {
            "run_id": run.id,
            "policy_version": policy.version,
            "scanned": run.scanned,
            "retained": run.retained,
            "reduced": run.reduced,
            "purged": run.purged,
            "restricted": run.restricted,
            "skipped_hold": run.skipped_hold,
        },
        entity_type="retention_run",
        entity_ref=run.id,
        occurred_at=run.finished_at,
        actor_reference="retention",
    )
    return run


def apply_tier_effect(
    db: Session,
    workspace: Workspace,
    subject_ref: str,
    effect: str,
) -> RetentionRun | None:
    normalized = effect.strip().upper()
    if normalized not in TIER_EFFECTS:
        raise RetentionProblem("WITHDRAWAL_TIER_INVALID", "The tier effect is not recognised.", 422)
    if normalized == "KEEP_ALL":
        return None
    return sweep(
        db,
        workspace,
        trigger="WITHDRAWAL",
        subject_ref=subject_ref,
        effect_override=normalized,
    )


def run_payload(run: RetentionRun) -> dict:
    return {
        "id": run.id,
        "policyVersion": run.policy_version,
        "trigger": run.trigger,
        "startedAt": run.started_at,
        "finishedAt": run.finished_at,
        "scanned": run.scanned,
        "retained": run.retained,
        "reduced": run.reduced,
        "purged": run.purged,
        "restricted": run.restricted,
        "skippedHold": run.skipped_hold,
        "details": run.details_json or [],
    }


def policy_payload(policy: RetentionPolicy) -> dict:
    rules = policy.rules_json or DEFAULT_RULES
    return {
        "id": policy.id,
        "version": policy.version,
        "active": policy.active,
        "activeDays": rules.get("activeDays", 14),
        "mediumDays": rules.get("mediumDays", 90),
        "highMinMessages": rules.get("highMinMessages", 5),
        "mediumMinMessages": rules.get("mediumMinMessages", 2),
        "actions": rules.get("actions", DEFAULT_RULES["actions"]),
        "updatedAt": policy.updated_at,
    }


def tier_payload(tier: WithdrawalTier) -> dict:
    return {
        "id": tier.id,
        "key": tier.key,
        "label": tier.label,
        "description": tier.description,
        "purposes": tier.purposes_json or [],
        "effect": tier.effect,
        "displayOrder": tier.display_order,
        "active": tier.active,
        "version": tier.version,
        "updatedAt": tier.updated_at,
    }


def last_runs(db: Session, workspace: Workspace, limit: int = 12) -> list[RetentionRun]:
    return list(db.scalars(select(RetentionRun).where(
        RetentionRun.workspace_id == workspace.id,
    ).order_by(RetentionRun.started_at.desc()).limit(limit)))
