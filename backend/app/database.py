"""Veritabanı bağlantısı (SQLite lokal / PostgreSQL prod), session ve Base."""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# Render Postgres "postgres://" verir; SQLAlchemy "postgresql://" bekler.
_db_url = settings.database_url
if _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql://", 1)

# SQLite için check_same_thread=False (FastAPI çoklu thread kullanır)
connect_args = {"check_same_thread": False} if _db_url.startswith("sqlite") else {}

engine = create_engine(_db_url, connect_args=connect_args, pool_pre_ping=True)
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
