import json
import sqlite3
from pathlib import Path

from app.config import get_settings


class SourceStore:
    """Owns raw synthetic source content outside the control-plane database."""

    def __init__(self, source_id: str) -> None:
        root = get_settings().source_store_dir
        root.mkdir(parents=True, exist_ok=True)
        self.path = root / f"source-{source_id}.db"
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS source_records (
                    source_record_id TEXT PRIMARY KEY,
                    dataset_import_id TEXT NOT NULL,
                    row_index INTEGER NOT NULL,
                    record_json TEXT NOT NULL
                )
            """)
            connection.execute("CREATE INDEX IF NOT EXISTS ix_source_records_import ON source_records(dataset_import_id)")
            connection.execute("""
                CREATE TABLE IF NOT EXISTS source_documents (
                    document_id TEXT PRIMARY KEY,
                    dataset_import_id TEXT NOT NULL,
                    content_text TEXT NOT NULL
                )
            """)

    def write_records(self, dataset_import_id: str, rows: list[tuple[str, int, dict]]) -> None:
        with self._connect() as connection:
            connection.executemany(
                "INSERT INTO source_records(source_record_id, dataset_import_id, row_index, record_json) VALUES (?, ?, ?, ?)",
                [(record_id, dataset_import_id, index, json.dumps(row, sort_keys=True)) for record_id, index, row in rows],
            )

    def write_document(self, document_id: str, dataset_import_id: str, content: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO source_documents(document_id, dataset_import_id, content_text) VALUES (?, ?, ?)",
                (document_id, dataset_import_id, content),
            )

    def read_record(self, source_record_id: str) -> dict | None:
        with self._connect() as connection:
            row = connection.execute("SELECT record_json FROM source_records WHERE source_record_id = ?", (source_record_id,)).fetchone()
        return json.loads(row["record_json"]) if row else None

    def read_records(self, source_record_ids: list[str]) -> dict[str, dict]:
        if not source_record_ids:
            return {}
        placeholders = ", ".join("?" for _ in source_record_ids)
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT source_record_id, record_json FROM source_records WHERE source_record_id IN ({placeholders})",
                source_record_ids,
            ).fetchall()
        return {row["source_record_id"]: json.loads(row["record_json"]) for row in rows}

    def read_import_records(self, dataset_import_id: str) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT record_json FROM source_records WHERE dataset_import_id = ? ORDER BY row_index",
                (dataset_import_id,),
            ).fetchall()
        return [json.loads(row["record_json"]) for row in rows]

    def read_document_text(self, document_id: str) -> str | None:
        with self._connect() as connection:
            row = connection.execute("SELECT content_text FROM source_documents WHERE document_id = ?", (document_id,)).fetchone()
        return row["content_text"] if row else None

    def update_record_field(self, source_record_id: str, field: str, value: str) -> bool:
        with self._connect() as connection:
            row = connection.execute("SELECT record_json FROM source_records WHERE source_record_id = ?", (source_record_id,)).fetchone()
            if row is None:
                return False
            record = json.loads(row["record_json"])
            if field not in record:
                return False
            record[field] = value
            connection.execute(
                "UPDATE source_records SET record_json = ? WHERE source_record_id = ?",
                (json.dumps(record, sort_keys=True), source_record_id),
            )
        return True

    def reset(self) -> None:
        with self._connect() as connection:
            connection.execute("DROP TABLE IF EXISTS source_records")
            connection.execute("DROP TABLE IF EXISTS source_documents")
        self._initialize()

    def delete_import(self, dataset_import_id: str) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM source_records WHERE dataset_import_id = ?", (dataset_import_id,))
            connection.execute("DELETE FROM source_documents WHERE dataset_import_id = ?", (dataset_import_id,))

    def delete_records(self, source_record_ids: list[str]) -> int:
        """Delete only the selected synthetic source rows; metadata remains in the control plane action ledger."""
        if not source_record_ids:
            return 0
        placeholders = ", ".join("?" for _ in source_record_ids)
        with self._connect() as connection:
            result = connection.execute(f"DELETE FROM source_records WHERE source_record_id IN ({placeholders})", source_record_ids)
        return result.rowcount
