"""SQLite bağlantısı, session ve Base tanımı."""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# SQLite için check_same_thread=False (FastAPI çoklu thread kullanır)
connect_args = (
    {"check_same_thread": False}
    if settings.database_url.startswith("sqlite")
    else {}
)

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Tüm ORM modellerinin türeyeceği temel sınıf."""


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency — istek başına bir DB session verir."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
