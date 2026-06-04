"""Lojistik endpoint'leri — donuk/soğuk karışık sipariş analizi."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import logistics_service

router = APIRouter(prefix="/api/logistics", tags=["logistics"])


_DATE = r"^\d{4}-\d{2}-\d{2}$"


@router.get("/summary")
def summary(
    start: str | None = Query(None, pattern=_DATE),
    end: str | None = Query(None, pattern=_DATE),
    db: Session = Depends(get_db),
):
    return logistics_service.summary(db, start=start, end=end)


@router.get("/mixed-orders")
def mixed_orders(
    start: str | None = Query(None, pattern=_DATE),
    end: str | None = Query(None, pattern=_DATE),
    db: Session = Depends(get_db),
):
    return logistics_service.mixed_orders(db, start=start, end=end)


@router.get("/trend")
def trend(
    period: str = Query("month", pattern="^(day|week|month)$"),
    db: Session = Depends(get_db),
):
    return logistics_service.trend(db, period=period)
