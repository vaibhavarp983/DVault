from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.api import engine as api_engine
from app.db import get_db
from app.main import app
from app.models import Base
from app.seed import seed_database


@pytest.fixture()
def client(tmp_path, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    test_engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(test_engine)
    with test_engine.begin() as connection:
        connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
        connection.execute(text("INSERT INTO alembic_version (version_num) VALUES ('0001_control_plane')"))
    TestSession = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    with TestSession() as session:
        seed_database(session)

    def get_test_db() -> Generator[Session, None, None]:
        with TestSession() as session:
            yield session

    monkeypatch.setattr("app.api.engine", test_engine)
    app.dependency_overrides[get_db] = get_test_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    test_engine.dispose()
