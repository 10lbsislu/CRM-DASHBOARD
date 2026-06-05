"""Bölüm 2: Sipariş istatistikleri — ciro, ortalama sepet, en çok satan, şehir kırılımı.

Tüm fonksiyonlar opsiyonel tarih aralığı (start dahil, end hariç) alır.
"""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Customer, Order, OrderItem
from app.services.constants import CONCENTRATION_THRESHOLDS, EXCLUDED_STATUSES

# Net ciroya dahil siparişleri seçen ortak filtre
_NET = Order.status.notin_(EXCLUDED_STATUSES)


def _date_conds(start: str | None, end: str | None) -> list:
    """order_date >= start ve order_date < end (end hariç). 'YYYY-MM-DD'."""
    conds = []
    if start:
        conds.append(Order.order_date >= start)
    if end:
        conds.append(Order.order_date < end)
    return conds


def available_months(db: Session) -> dict:
    """Veri setindeki ilk/son tarih ve ay listesi (ay-ay seçim için)."""
    mn = db.scalar(select(func.min(Order.order_date)).where(_NET))
    mx = db.scalar(select(func.max(Order.order_date)).where(_NET))
    months: list[str] = []
    if mn and mx:
        y, m = mn.year, mn.month
        while (y, m) <= (mx.year, mx.month):
            months.append(f"{y:04d}-{m:02d}")
            m += 1
            if m > 12:
                m = 1
                y += 1
    return {
        "min": mn.strftime("%Y-%m-%d") if mn else None,
        "max": mx.strftime("%Y-%m-%d") if mx else None,
        "months": months,
    }


def summary(db: Session, start: str | None = None, end: str | None = None) -> dict:
    """Genel özet kartları: net ciro, sipariş sayısı, ortalama sepet, müşteri, kalem."""
    dc = _date_conds(start, end)
    revenue = db.scalar(
        select(func.coalesce(func.sum(Order.total), 0)).where(_NET, *dc)
    )
    order_count = db.scalar(select(func.count()).select_from(Order).where(_NET, *dc))
    customers = db.scalar(
        select(func.count(func.distinct(Order.customer_id))).where(_NET, *dc)
    )
    items = db.scalar(
        select(func.coalesce(func.sum(OrderItem.quantity), 0))
        .select_from(OrderItem)
        .join(Order, OrderItem.order_number == Order.order_number)
        .where(_NET, *dc)
    )
    avg_basket = (revenue / order_count) if order_count else 0
    return {
        "net_revenue": round(revenue, 2),
        "order_count": order_count,
        "avg_basket": round(avg_basket, 2),
        "unique_customers": customers,
        "total_items": items,
    }


def top_products(db: Session, limit: int = 10, by: str = "quantity",
                 start: str | None = None, end: str | None = None) -> list[dict]:
    """En çok satan ürünler — adet veya ciroya göre."""
    qty = func.coalesce(func.sum(OrderItem.quantity), 0).label("quantity")
    revenue = func.coalesce(
        func.sum(OrderItem.quantity * OrderItem.unit_price), 0
    ).label("revenue")
    order_by = revenue if by == "revenue" else qty
    q = (
        select(OrderItem.product_name, qty, revenue)
        .join(Order, OrderItem.order_number == Order.order_number)
        .where(_NET, *_date_conds(start, end))
        .group_by(OrderItem.product_name)
        .order_by(order_by.desc())
        .limit(limit)
    )
    return [
        {
            "product_name": r.product_name,
            "quantity": int(r.quantity),
            "revenue": round(r.revenue, 2),
        }
        for r in db.execute(q).all()
    ]


def top_customers(db: Session, limit: int = 10,
                  start: str | None = None, end: str | None = None) -> list[dict]:
    """En sık sipariş veren müşteriler — sipariş sayısına göre."""
    orders = func.count().label("orders")
    revenue = func.coalesce(func.sum(Order.total), 0).label("revenue")
    q = (
        select(Order.customer_id, Customer.full_name, orders, revenue)
        .outerjoin(Customer, Order.customer_id == Customer.id)
        .where(_NET, *_date_conds(start, end))
        .where(Order.customer_id.isnot(None))
        .group_by(Order.customer_id)
        .order_by(orders.desc(), revenue.desc())
        .limit(limit)
    )
    return [
        {
            "name": r.full_name or r.customer_id,
            "orders": r.orders,
            "revenue": round(r.revenue, 2),
        }
        for r in db.execute(q).all()
    ]


def by_city(db: Session, limit: int = 15,
            start: str | None = None, end: str | None = None) -> list[dict]:
    """Şehir kırılımı — sipariş sayısı ve net ciro."""
    revenue = func.coalesce(func.sum(Order.total), 0).label("revenue")
    q = (
        select(
            func.coalesce(Order.city, "Bilinmiyor").label("city"),
            func.count().label("orders"),
            revenue,
        )
        .where(_NET, *_date_conds(start, end))
        .group_by(Order.city)
        .order_by(revenue.desc())
        .limit(limit)
    )
    return [
        {
            "city": r.city, "orders": r.orders, "revenue": round(r.revenue, 2),
            "avg_basket": round(r.revenue / r.orders, 2) if r.orders else 0,
        }
        for r in db.execute(q).all()
    ]


def concentration(db: Session, start: str | None = None,
                  end: str | None = None) -> dict:
    """Konsantrasyon riski: ilk 3/5/10 müşterinin toplam ciro içindeki payı."""
    dc = _date_conds(start, end)
    rows = db.execute(
        select(
            Order.customer_id, Customer.full_name,
            func.coalesce(func.sum(Order.total), 0).label("rev"),
        )
        .outerjoin(Customer, Order.customer_id == Customer.id)
        .where(_NET, *dc).where(Order.customer_id.isnot(None))
        .group_by(Order.customer_id)
        .order_by(func.sum(Order.total).desc())
    ).all()
    revs = [float(r.rev) for r in rows]
    total = sum(revs) or 0

    def share(n: int) -> float:
        return round(sum(revs[:n]) * 100 / total, 1) if total else 0

    levels = []
    for n in (3, 5, 10):
        pct = share(n)
        thr = CONCENTRATION_THRESHOLDS.get(n, 100)
        levels.append({"top": n, "pct": pct, "threshold": thr, "risk": pct >= thr})
    return {
        "total_revenue": round(total, 2),
        "customer_count": len(revs),
        "levels": levels,
        "top_customers": [
            {"name": r.full_name or r.customer_id, "revenue": round(float(r.rev), 2)}
            for r in rows[:10]
        ],
    }
