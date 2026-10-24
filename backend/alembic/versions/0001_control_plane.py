

from alembic import op
import sqlalchemy as sa

revision = "0001_control_plane"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False, unique=True),
        sa.Column("demo_status", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "sources",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("source_key", sa.String(80), nullable=False),
        sa.Column("display_name", sa.String(160), nullable=False),
        sa.Column("source_type", sa.String(48), nullable=False),
        sa.Column("connection_status", sa.String(32), nullable=False),
        sa.Column("health_summary", sa.String(320), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("configuration_metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "source_key", name="uq_source_workspace_key"),
    )
    op.create_table(
        "fixture_manifests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("fixture_version", sa.String(40), nullable=False),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("generator_label", sa.String(160), nullable=False),
        sa.Column("seeded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("workspace_id", "fixture_version", name="uq_manifest_workspace_version"),
    )
    op.create_table(
        "api_contract_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("version", sa.String(32), nullable=False, unique=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("compatibility_status", sa.String(32), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_table(
        "documents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("source_id", sa.String(36), sa.ForeignKey("sources.id"), nullable=False),
        sa.Column("document_key", sa.String(100), nullable=False),
        sa.Column("synthetic_label", sa.String(64), nullable=False),
        sa.Column("document_type", sa.String(48), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("source_path", sa.String(500), nullable=False),
        sa.Column("display_title", sa.String(255), nullable=False),
        sa.Column("document_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("processing_status", sa.String(32), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "document_key", name="uq_document_workspace_key"),
    )
    op.create_index("ix_sources_workspace_id", "sources", ["workspace_id"])
    op.create_index("ix_documents_workspace_id", "documents", ["workspace_id"])
    op.create_index("ix_documents_source_id", "documents", ["source_id"])
    op.create_index("ix_documents_type", "documents", ["document_type"])


def downgrade() -> None:
    op.drop_index("ix_documents_type", table_name="documents")
    op.drop_index("ix_documents_source_id", table_name="documents")
    op.drop_index("ix_documents_workspace_id", table_name="documents")
    op.drop_index("ix_sources_workspace_id", table_name="sources")
    op.drop_table("documents")
    op.drop_table("api_contract_versions")
    op.drop_table("fixture_manifests")
    op.drop_table("sources")
    op.drop_table("workspaces")
