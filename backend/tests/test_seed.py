from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.models import Base, Document, Source, Workspace
from app.seed import seed_database


def test_seed_is_idempotent(tmp_path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'seed.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        first = seed_database(session)
        second = seed_database(session)
        assert first == second
        assert session.scalar(select(func.count(Workspace.id))) == 1
        assert session.scalar(select(func.count(Source.id))) == 4
        assert session.scalar(select(func.count(Document.id))) == 11
