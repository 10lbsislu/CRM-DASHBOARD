"""Bölüm 4 endpoint'leri: birlikte alınan ürünler (market-basket)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import basket_service
from app.services.constants import DEFAULT_MIN_PAIR_COUNT

router = APIRouter(prefix="/api/basket", tags=["basket"])


@router.get("/pairs")
def pairs(
    min_count: int = Query(DEFAULT_MIN_PAIR_COUNT, ge=1, le=100),
    top_n: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    return basket_service.product_pairs(db, min_count=min_count, top_n=top_n)
