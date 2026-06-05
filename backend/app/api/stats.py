"""Bölüm 2 endpoint'leri: ciro, ortalama sepet, en çok satan, şehir kırılımı.

Tüm endpoint'ler opsiyonel ?start=YYYY-MM-DD&end=YYYY-MM-DD (end hariç) alır.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import stats_service

router = APIRouter(prefix="/api/stats", tags=["stats"])

_DATE = r"^\d{4}-\d{2}-\d{2}$"


@router.get("/months")
def months(db: Session = Depends(get_db)):
    """Ay-ay seçim için: ilk/son tarih ve ay listesi."""
    return stats_service.available_months(db)


@router.get("/summary")
def summary(
    start: str | None = Query(None, pattern=_DATE),
    end: str | None = Query(None, pattern=_DATE),
    db: Session = Depends(get_db),
):
    return stats_service.summary(db, start=start, end=end)


@router.get("/top-products")
def top_products(
    limit: int = Query(10, ge=1, le=50),
    by: str = Query("quantity", pattern="^(quantity|revenue)$"),
    start: str | None = Query(None, pattern=_DATE),
    end: str | None = Query(None, pattern=_DATE),
    db: Session = Depends(get_db),
):
    return stats_service.top_products(db, limit=limit, by=by, start=start, end=end)


@router.get("/top-customers")
def top_customers(
    limit: int = Query(10, ge=1, le=50),
    start: str | None = Query(None, pattern=_DATE),
    end: str | None = Query(None, pattern=_DATE),
    db: Session = Depends(get_db),
):
    return stats_service.top_customers(db, limit=limit, start=start, end=end)


@router.get("/concentration")
def concentration(
    start: str | None = Query(None, pattern=_DATE),
    end: str | None = Query(None, pattern=_DATE),
    db: Session = Depends(get_db),
):
    return stats_service.concentration(db, start=start, end=end)


@router.get("/by-city")
def by_city(
    limit: int = Query(15, ge=1, le=100),
    start: str | None = Query(None, pattern=_DATE),
    end: str | None = Query(None, pattern=_DATE),
    db: Session = Depends(get_db),
):
    return stats_service.by_city(db, limit=limit, start=start, end=end)
