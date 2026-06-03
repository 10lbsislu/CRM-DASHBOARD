"""Bölüm 4: Birlikte alınan ürünler — market-basket analizi."""
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.market_basket import compute_pairs
from app.models import Order, OrderItem
from app.services.constants import DEFAULT_MIN_PAIR_COUNT, EXCLUDED_STATUSES

_NET = Order.status.notin_(EXCLUDED_STATUSES)


def _transactions(db: Session) -> list[set[str]]:
    """Her sipariş için o siparişteki tekil ürün adları kümesi (iptal/iade hariç)."""
    q = (
        select(OrderItem.order_number, OrderItem.product_name)
        .join(Order, OrderItem.order_number == Order.order_number)
        .where(_NET)
        .where(OrderItem.product_name.isnot(None))
    )
    baskets: dict[str, set[str]] = defaultdict(set)
    for order_no, name in db.execute(q).all():
        baskets[order_no].add(name)
    # Tek ürünlü siparişler çift üretmez ama hesaplama onları zaten atlar
    return list(baskets.values())


def product_pairs(
    db: Session, min_count: int = DEFAULT_MIN_PAIR_COUNT, top_n: int = 50
) -> dict:
    txns = _transactions(db)
    pairs = compute_pairs(txns, min_pair_count=min_count, top_n=top_n)
    return {
        "total_baskets": len(txns),
        "min_pair_count": min_count,
        "pairs": pairs,
    }
