"""Bölüm 1 endpoint'leri: yeni siparişler + trend."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import orders_service

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.get("/recent")
def recent(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    return orders_service.recent_orders(db, limit=limit)


@router.get("/list")
def list_all(db: Session = Depends(get_db)):
    """Tüm siparişler (yeniden eskiye) — ad + kaçıncı alışveriş bilgisiyle."""
    return orders_service.list_orders(db)


@router.get("/trend")
def trend(
    period: str = Query("day", pattern="^(day|week|month)$"),
    db: Session = Depends(get_db),
):
    return orders_service.order_trend(db, period=period)


@router.get("/{order_number}")
def detail(order_number: str, db: Session = Depends(get_db)):
    """Bir siparişin detayı (içindeki ürünler)."""
    d = orders_service.order_detail(db, order_number)
    if d is None:
        raise HTTPException(404, "Sipariş bulunamadı")
    return d
