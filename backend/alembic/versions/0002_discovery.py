"""Add ingestion and discovery state."""

from alembic import op
import sqlalchemy as sa

revision = "0002_discovery"
down_revision = "0001_control_plane"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("dataset_imports",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("source_id", sa.String(36), sa.ForeignKey("sources.id"), nullable=False), sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id"), nullable=True),
        sa.Column("filename", sa.String(255), nullable=False), sa.Column("content_type", sa.String(100), nullable=False), sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False), sa.Column("status", sa.String(32), nullable=False), sa.Column("row_count", sa.Integer(), nullable=True),
        sa.Column("error_code", sa.String(80), nullable=True), sa.Column("error_message", sa.String(500), nullable=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("source_id", "content_sha256", name="uq_import_source_fingerprint"))
    op.create_table("import_field_profiles",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("dataset_import_id", sa.String(36), sa.ForeignKey("dataset_imports.id"), nullable=False), sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("source_field", sa.String(255), nullable=False), sa.Column("normalized_field", sa.String(255), nullable=False), sa.Column("primitive_type", sa.String(32), nullable=False), sa.Column("classification", sa.String(48), nullable=False), sa.Column("confidence", sa.Float(), nullable=False), sa.Column("detection_reason", sa.String(255), nullable=False), sa.Column("non_null_count", sa.Integer(), nullable=False), sa.Column("distinct_count", sa.Integer(), nullable=False), sa.Column("masked_samples_json", sa.JSON(), nullable=False), sa.Column("mapping_status", sa.String(32), nullable=False), sa.UniqueConstraint("dataset_import_id", "ordinal", name="uq_profile_import_ordinal"))
    op.create_table("data_record_refs",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False), sa.Column("source_id", sa.String(36), sa.ForeignKey("sources.id"), nullable=False), sa.Column("dataset_import_id", sa.String(36), sa.ForeignKey("dataset_imports.id"), nullable=False), sa.Column("source_record_id", sa.String(100), nullable=False), sa.Column("subject_ref", sa.String(80), nullable=True), sa.Column("record_type", sa.String(48), nullable=False), sa.Column("match_status", sa.String(32), nullable=False), sa.Column("field_metadata_json", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("dataset_import_id", "source_record_id", name="uq_record_import_source_id"))
    op.create_table("identity_tokens",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False), sa.Column("record_ref_id", sa.String(36), sa.ForeignKey("data_record_refs.id"), nullable=False), sa.Column("token_type", sa.String(32), nullable=False), sa.Column("hmac_token", sa.String(64), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("record_ref_id", "token_type", "hmac_token", name="uq_token_record_value"))
    op.create_table("match_candidates",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False), sa.Column("left_record_ref_id", sa.String(36), sa.ForeignKey("data_record_refs.id"), nullable=False), sa.Column("right_record_ref_id", sa.String(36), sa.ForeignKey("data_record_refs.id"), nullable=False), sa.Column("match_method", sa.String(64), nullable=False), sa.Column("confidence", sa.Float(), nullable=False), sa.Column("status", sa.String(32), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("left_record_ref_id", "right_record_ref_id", name="uq_match_pair"))
    op.create_table("data_quality_findings",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("workspace_id", sa.String(36), sa.ForeignKey("workspaces.id"), nullable=False), sa.Column("source_id", sa.String(36), sa.ForeignKey("sources.id"), nullable=False), sa.Column("dataset_import_id", sa.String(36), sa.ForeignKey("dataset_imports.id"), nullable=True), sa.Column("code", sa.String(80), nullable=False), sa.Column("severity", sa.String(16), nullable=False), sa.Column("field_name", sa.String(255), nullable=True), sa.Column("affected_record_count", sa.Integer(), nullable=False), sa.Column("status", sa.String(32), nullable=False), sa.Column("details_json", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("document_extractions",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("document_id", sa.String(36), sa.ForeignKey("documents.id"), nullable=False), sa.Column("dataset_import_id", sa.String(36), sa.ForeignKey("dataset_imports.id"), nullable=False), sa.Column("extraction_status", sa.String(32), nullable=False), sa.Column("character_count", sa.Integer(), nullable=False), sa.Column("redacted_text_preview", sa.Text(), nullable=False), sa.Column("entity_summary_json", sa.JSON(), nullable=False), sa.Column("warnings_json", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("document_id", name="uq_extraction_document"))
    for table, columns in (("dataset_imports", ["workspace_id", "source_id", "status"]), ("import_field_profiles", ["dataset_import_id", "classification", "mapping_status"]), ("data_record_refs", ["workspace_id", "source_id", "dataset_import_id", "subject_ref", "match_status"]), ("identity_tokens", ["workspace_id", "record_ref_id", "token_type", "hmac_token"]), ("match_candidates", ["workspace_id", "left_record_ref_id", "right_record_ref_id", "status"]), ("data_quality_findings", ["workspace_id", "source_id", "dataset_import_id", "code", "severity"]), ("document_extractions", ["document_id", "dataset_import_id"])):
        for column in columns:
            op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade() -> None:
    for table in ("document_extractions", "data_quality_findings", "match_candidates", "identity_tokens", "data_record_refs", "import_field_profiles", "dataset_imports"):
        op.drop_table(table)
