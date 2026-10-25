"""Add messaging conversations, retention policy runs, and withdrawal tiers."""

from alembic import op
import sqlalchemy as sa

revision = "0007_phase7_messaging"
down_revision = "0006_phase6_integration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("subject_ref", sa.String(80), nullable=False),
        sa.Column("channel", sa.String(24), nullable=False),
        sa.Column("subject_line", sa.String(240), nullable=False, server_default=""),
        sa.Column("thread_key", sa.String(160), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="OPEN"),
        sa.Column("interaction_level", sa.String(16), nullable=False, server_default="LOW"),
        sa.Column("retention_class", sa.String(16), nullable=False, server_default="FULL"),
        sa.Column("integrity_state", sa.String(16), nullable=False, server_default="VERIFIED"),
        sa.Column("message_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "thread_key", name="uq_conversation_workspace_thread"),
    )
    for column in ("workspace_id", "subject_ref", "channel", "status", "interaction_level", "retention_class", "integrity_state", "last_activity_at"):
        op.create_index(f"ix_conversations_{column}", "conversations", [column])

    op.create_table(
        "conversation_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("conversation_id", sa.String(36), sa.ForeignKey("conversations.id"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("direction", sa.String(16), nullable=False),
        sa.Column("sender", sa.String(16), nullable=False),
        sa.Column("author_label", sa.String(160), nullable=False),
        sa.Column("subject_line", sa.String(240), nullable=False, server_default=""),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("body_sha256", sa.String(64), nullable=False),
        sa.Column("subject_sha256", sa.String(64), nullable=False),
        sa.Column("previous_hash", sa.String(64), nullable=False),
        sa.Column("message_hash", sa.String(64), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("retention_state", sa.String(16), nullable=False, server_default="FULL"),
        sa.Column("redacted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("purged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("read_by_business_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("read_by_customer_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tamper_state", sa.String(16), nullable=False, server_default="VERIFIED"),
        sa.UniqueConstraint("conversation_id", "sequence", name="uq_conversation_message_sequence"),
    )
    for column in ("workspace_id", "conversation_id", "direction", "sender", "message_hash", "sent_at", "retention_state", "tamper_state"):
        op.create_index(f"ix_conversation_messages_{column}", "conversation_messages", [column])

    op.create_table(
        "retention_policies",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("rules_json", sa.JSON(), nullable=False),
        sa.Column("updated_by", sa.String(160), nullable=False, server_default="demo_desktop"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "version", name="uq_retention_policy_version"),
    )
    op.create_index("ix_retention_policies_workspace_id", "retention_policies", ["workspace_id"])
    op.create_index("ix_retention_policies_active", "retention_policies", ["active"])

    op.create_table(
        "retention_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("policy_version", sa.Integer(), nullable=False),
        sa.Column("trigger", sa.String(40), nullable=False, server_default="MANUAL"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scanned", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("retained", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reduced", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("purged", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("restricted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped_hold", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("details_json", sa.JSON(), nullable=False),
    )
    op.create_index("ix_retention_runs_workspace_id", "retention_runs", ["workspace_id"])
    op.create_index("ix_retention_runs_started_at", "retention_runs", ["started_at"])

    op.create_table(
        "withdrawal_tiers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("key", sa.String(60), nullable=False),
        sa.Column("label", sa.String(160), nullable=False),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("purposes_json", sa.JSON(), nullable=False),
        sa.Column("effect", sa.String(32), nullable=False, server_default="KEEP_ALL"),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "key", name="uq_withdrawal_tier_workspace_key"),
    )
    op.create_index("ix_withdrawal_tiers_workspace_id", "withdrawal_tiers", ["workspace_id"])
    op.create_index("ix_withdrawal_tiers_active", "withdrawal_tiers", ["active"])


def downgrade() -> None:
    for index in ("ix_withdrawal_tiers_active", "ix_withdrawal_tiers_workspace_id"):
        op.drop_index(index, table_name="withdrawal_tiers")
    op.drop_table("withdrawal_tiers")
    for index in ("ix_retention_runs_started_at", "ix_retention_runs_workspace_id"):
        op.drop_index(index, table_name="retention_runs")
    op.drop_table("retention_runs")
    for index in ("ix_retention_policies_active", "ix_retention_policies_workspace_id"):
        op.drop_index(index, table_name="retention_policies")
    op.drop_table("retention_policies")
    for column in ("tamper_state", "retention_state", "sent_at", "message_hash", "sender", "direction", "conversation_id", "workspace_id"):
        op.drop_index(f"ix_conversation_messages_{column}", table_name="conversation_messages")
    op.drop_table("conversation_messages")
    for column in ("last_activity_at", "integrity_state", "retention_class", "interaction_level", "status", "channel", "subject_ref", "workspace_id"):
        op.drop_index(f"ix_conversations_{column}", table_name="conversations")
    op.drop_table("conversations")
