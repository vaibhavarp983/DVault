"""Add frontend projection, portability, rectification, and demo controls."""

from alembic import op
import sqlalchemy as sa

revision = "0006_phase6_integration"
down_revision = "0005_evidence_breach"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("review_status", sa.String(24), nullable=False, server_default="AUTO"))
    op.add_column("documents", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("documents", sa.Column("confidence", sa.Float(), nullable=True))
    op.add_column("documents", sa.Column("preview_json", sa.JSON(), nullable=True))
    op.add_column("documents", sa.Column("primary_subject_ref", sa.String(80), nullable=True))
    op.create_index("ix_documents_review_status", "documents", ["review_status"])
    op.create_index("ix_documents_primary_subject_ref", "documents", ["primary_subject_ref"])

    op.add_column("rights_requests", sa.Column("reference", sa.String(40), nullable=True))
    op.add_column("rights_requests", sa.Column("due_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("rights_requests", sa.Column("correction_json", sa.JSON(), nullable=True))
    op.create_index("ix_rights_requests_reference", "rights_requests", ["reference"])

    op.add_column("rights_access_artifacts", sa.Column("kind", sa.String(32), nullable=False, server_default="ACCESS_SUMMARY"))
    op.add_column("rights_access_artifacts", sa.Column("bundle_json", sa.JSON(), nullable=True))
    op.create_index("ix_rights_access_artifacts_kind", "rights_access_artifacts", ["kind"])

    op.create_table(
        "demo_customers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("subject_ref", sa.String(80), nullable=False),
        sa.Column("display_name", sa.String(160), nullable=False),
        sa.Column("company", sa.String(160), nullable=False),
        sa.Column("email_masked", sa.String(160), nullable=False),
        sa.Column("phone_masked", sa.String(80), nullable=False),
        sa.Column("segment", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("owner", sa.String(120), nullable=False),
        sa.Column("location", sa.String(160), nullable=False),
        sa.Column("since", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_ids_json", sa.JSON(), nullable=False),
        sa.Column("primary_source_id", sa.String(36), sa.ForeignKey("sources.id"), nullable=True),
        sa.Column("primary_source_record_id", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "subject_ref", name="uq_demo_customer_subject"),
    )
    op.create_index("ix_demo_customers_workspace_id", "demo_customers", ["workspace_id"])
    op.create_index("ix_demo_customers_subject_ref", "demo_customers", ["subject_ref"])

    op.create_table(
        "demo_failure_log",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("target_ref", sa.String(120), nullable=True),
        sa.Column("details_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_demo_failure_log_workspace_id", "demo_failure_log", ["workspace_id"])
    op.create_index("ix_demo_failure_log_kind", "demo_failure_log", ["kind"])
    op.create_index("ix_demo_failure_log_created_at", "demo_failure_log", ["created_at"])


def downgrade() -> None:
    for index in (
        "ix_demo_failure_log_created_at",
        "ix_demo_failure_log_kind",
        "ix_demo_failure_log_workspace_id",
    ):
        op.drop_index(index, table_name="demo_failure_log")
    op.drop_table("demo_failure_log")
    for index in ("ix_demo_customers_subject_ref", "ix_demo_customers_workspace_id"):
        op.drop_index(index, table_name="demo_customers")
    op.drop_table("demo_customers")
    op.drop_index("ix_rights_access_artifacts_kind", table_name="rights_access_artifacts")
    op.drop_column("rights_access_artifacts", "bundle_json")
    op.drop_column("rights_access_artifacts", "kind")
    op.drop_index("ix_rights_requests_reference", table_name="rights_requests")
    op.drop_column("rights_requests", "correction_json")
    op.drop_column("rights_requests", "due_at")
    op.drop_column("rights_requests", "reference")
    op.drop_index("ix_documents_primary_subject_ref", table_name="documents")
    op.drop_index("ix_documents_review_status", table_name="documents")
    op.drop_column("documents", "primary_subject_ref")
    op.drop_column("documents", "preview_json")
    op.drop_column("documents", "confidence")
    op.drop_column("documents", "reviewed_at")
    op.drop_column("documents", "review_status")
