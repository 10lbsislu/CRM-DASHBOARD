"""Bölüm 3 endpoint'leri: RFM, en değerli müşteriler, churn riski."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import customers_service
from app.services.constants import DEFAULT_CHURN_DAYS

router = APIRouter(prefix="/api/customers", tags=["customers"])


@router.get("/rfm")
def rfm(db: Session = Depends(get_db)):
    return customers_service.rfm_table(db)


@router.get("/top")
def top(limit: int = Query(10, ge=1, le=100), db: Session = Depends(get_db)):
    return customers_service.top_customers(db, limit=limit)


@router.get("/churn-risk")
def churn_risk(
    days: int = Query(DEFAULT_CHURN_DAYS, ge=1, le=3650),
    db: Session = Depends(get_db),
):
    return customers_service.churn_risk(db, days=days)


@router.get("/new-returning")
def new_returning(
    period: str = Query("month", pattern="^(day|week|month)$"),
    db: Session = Depends(get_db),
):
    return customers_service.new_vs_returning(db, period=period)


@router.get("/daily")
def daily(date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
          db: Session = Depends(get_db)):
    return customers_service.daily_activity(db, date=date)


@router.get("/reorder-interval")
def reorder_interval(db: Session = Depends(get_db)):
    return customers_service.reorder_interval(db)


@router.get("/loyalty")
def loyalty(
    start: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: Session = Depends(get_db),
):
    return customers_service.loyalty_summary(db, start=start, end=end)
