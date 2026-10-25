"""Add append-only evidence, integrity incidents, and the breach register."""

from alembic import op
import sqlalchemy as sa

revision = "0005_evidence_breach"
down_revision = "0004_rights_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("entity_type", sa.String(48), nullable=True),
        sa.Column("entity_ref", sa.String(120), nullable=True),
        sa.Column("payload_schema", sa.String(48), nullable=False),
        sa.Column("canonical_payload", sa.Text(), nullable=False),
        sa.Column("payload_sha256", sa.String(64), nullable=False),
        sa.Column("previous_hash", sa.String(64), nullable=False),
        sa.Column("event_hash", sa.String(64), nullable=False),
        sa.Column("actor_reference", sa.String(160), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "sequence", name="uq_audit_event_sequence"),
    )
    op.create_table(
        "audit_checkpoints",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("head_hash", sa.String(64), nullable=False),
        sa.Column("signature", sa.Text(), nullable=False),
        sa.Column("public_key", sa.String(64), nullable=False),
        sa.Column("key_id", sa.String(64), nullable=False),
        sa.Column("algorithm", sa.String(24), nullable=False),
        sa.Column("note", sa.String(320), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "sequence", name="uq_audit_checkpoint_sequence"),
    )
    op.create_table(
        "audit_verifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("evidence_state", sa.String(32), nullable=False),
        sa.Column("checked_event_total", sa.Integer(), nullable=False),
        sa.Column("verified_through_sequence", sa.Integer(), nullable=True),
        sa.Column("failure_sequence", sa.Integer(), nullable=True),
        sa.Column("untrusted_from_sequence", sa.Integer(), nullable=True),
        sa.Column("reason_code", sa.String(80), nullable=True),
        sa.Column("reason_message", sa.String(320), nullable=True),
        sa.Column("failures_json", sa.JSON(), nullable=False),
        sa.Column("checkpoint_sequence", sa.Integer(), nullable=True),
        sa.Column("checkpoint_status", sa.String(24), nullable=True),
        sa.Column("checkpoint_signed", sa.Boolean(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "integrity_incidents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("first_failure_sequence", sa.Integer(), nullable=False),
        sa.Column("reason_code", sa.String(80), nullable=False),
        sa.Column("reason_message", sa.String(320), nullable=False),
        sa.Column("verification_id", sa.String(36), sa.ForeignKey("audit_verifications.id"), nullable=True),
        sa.Column("linked_breach_incident_id", sa.String(36), nullable=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_decision", sa.String(32), nullable=True),
        sa.Column("resolution_note", sa.String(500), nullable=True),
    )
    op.create_table(
        "breach_incidents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("incident_ref", sa.String(40), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("origin", sa.String(32), nullable=False),
        sa.Column("origin_ref", sa.String(120), nullable=True),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("scope_status", sa.String(24), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("assessment_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("assessed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notifiable", sa.Boolean(), nullable=True),
        sa.Column("assessment_reason_code", sa.String(80), nullable=True),
        sa.Column("assessment_note", sa.String(500), nullable=True),
        sa.Column("assessment_timeliness", sa.String(24), nullable=True),
        sa.Column("notification_status", sa.String(24), nullable=False),
        sa.Column("notification_drafted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notification_subject", sa.String(200), nullable=True),
        sa.Column("notification_body", sa.Text(), nullable=True),
        sa.Column("containment_summary", sa.Text(), nullable=True),
        sa.Column("close_note", sa.String(500), nullable=True),
        sa.Column("linked_integrity_incident_id", sa.String(36), sa.ForeignKey("integrity_incidents.id"), nullable=True),
        sa.Column("created_by_reference", sa.String(160), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("workspace_id", "incident_ref", name="uq_breach_incident_ref"),
    )
    op.create_table(
        "breach_affected_subjects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("breach_incident_id", sa.String(36), sa.ForeignKey("breach_incidents.id"), nullable=False),
        sa.Column("subject_ref", sa.String(80), nullable=False),
        sa.Column("resolution_status", sa.String(24), nullable=False),
        sa.Column("record_count", sa.Integer(), nullable=False),
        sa.Column("sources_json", sa.JSON(), nullable=False),
        sa.UniqueConstraint("breach_incident_id", "subject_ref", name="uq_breach_subject"),
    )
    op.create_table(
        "breach_affected_sources",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("breach_incident_id", sa.String(36), sa.ForeignKey("breach_incidents.id"), nullable=False),
        sa.Column("source_id", sa.String(36), sa.ForeignKey("sources.id"), nullable=False),
        sa.Column("affected_record_count", sa.Integer(), nullable=False),
        sa.Column("affected_subject_count", sa.Integer(), nullable=False),
        sa.Column("note", sa.String(320), nullable=True),
        sa.UniqueConstraint("breach_incident_id", "source_id", name="uq_breach_source"),
    )
    indexes = (
        ("audit_events", ["workspace_id", "sequence", "event_type", "event_hash", "recorded_at"]),
        ("audit_checkpoints", ["workspace_id"]),
        ("audit_verifications", ["workspace_id", "status", "verified_at"]),
        ("integrity_incidents", ["workspace_id", "status"]),
        ("breach_incidents", ["workspace_id", "origin", "status", "assessment_due_at"]),
        ("breach_affected_subjects", ["breach_incident_id"]),
        ("breach_affected_sources", ["breach_incident_id", "source_id"]),
    )
    for table, columns in indexes:
        for column in columns:
            op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade() -> None:
    for table in ("breach_affected_sources", "breach_affected_subjects", "breach_incidents", "integrity_incidents", "audit_verifications", "audit_checkpoints", "audit_events"):
        op.drop_table(table)
