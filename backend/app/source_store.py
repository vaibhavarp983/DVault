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

    def delete_import(self, dataset_import_id: str) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM source_records WHERE dataset_import_id = ?", (dataset_import_id,))
            connection.execute("DELETE FROM source_documents WHERE dataset_import_id = ?", (dataset_import_id,))
