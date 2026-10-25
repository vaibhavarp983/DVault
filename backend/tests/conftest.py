from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db import get_db
from app.main import app
from app.models import Base
from app.seed import seed_database


@pytest.fixture()
def test_database(tmp_path, monkeypatch: pytest.MonkeyPatch):
    test_engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(test_engine)
    with test_engine.begin() as connection:
        connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
        connection.execute(text("INSERT INTO alembic_version (version_num) VALUES ('0001_control_plane')"))
    TestSession = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    settings = Settings(
        source_store_dir=tmp_path / "source_stores",
        audit_signing_key_path=tmp_path / "keys" / "audit_signing_key.pem",
        enable_demo_controls=True,
        enable_failure_injection=True,
        demo_show_synthetic_contacts=True,
    )
    monkeypatch.setattr("app.source_store.get_settings", lambda: settings)
    monkeypatch.setattr("app.evidence.get_settings", lambda: settings)
    monkeypatch.setattr("app.demo_api.get_settings", lambda: settings)
    monkeypatch.setattr("app.demo_projection.get_settings", lambda: settings)
    monkeypatch.setattr("app.demo_failures.get_settings", lambda: settings)
    monkeypatch.setattr("app.demo_reset.get_settings", lambda: settings)
    with TestSession() as session:
        seed_database(session)
    yield TestSession, test_engine
    test_engine.dispose()


@pytest.fixture()
def db_session(test_database) -> Generator[Session, None, None]:
    TestSession, _ = test_database
    with TestSession() as session:
        yield session


@pytest.fixture()
def client(test_database, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    TestSession, test_engine = test_database

    def get_test_db() -> Generator[Session, None, None]:
        with TestSession() as session:
            yield session

    monkeypatch.setattr("app.api.engine", test_engine)
    app.dependency_overrides[get_db] = get_test_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
