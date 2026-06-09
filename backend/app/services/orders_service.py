"""Bölüm 1: Siparişler ve sipariş trendi."""
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Customer, Order, OrderItem
from app.services.constants import EXCLUDED_STATUSES

# SQLite strftime kalıpları
_PERIOD_FMT = {"day": "%Y-%m-%d", "week": "%Y-%W", "month": "%Y-%m"}


def recent_orders(db: Session, limit: int = 20) -> list[dict]:
    """En son siparişler (tüm durumlar dahil — yeni sipariş akışını gösterir)."""
    item_count = (
        select(OrderItem.order_number, func.count().label("n"))
        .group_by(OrderItem.order_number)
        .subquery()
    )
    q = (
        select(
            Order.order_number,
            Order.order_date,
            Order.customer_email,
            Order.total,
            Order.status,
            Order.payment_status,
            Order.city,
            func.coalesce(item_count.c.n, 0).label("item_count"),
        )
        .outerjoin(item_count, Order.order_number == item_count.c.order_number)
        .order_by(Order.order_date.desc())
        .limit(limit)
    )
    rows = db.execute(q).all()
    return [
        {
            "order_number": r.order_number,
            "order_date": r.order_date,
            "customer_email": r.customer_email,
            "total": r.total,
            "status": r.status,
            "payment_status": r.payment_status,
            "city": r.city,
            "item_count": r.item_count,
        }
        for r in rows
    ]


def _purchase_sequence(db: Session) -> tuple[dict, dict]:
    """Her sipariş için müşterinin kaçıncı siparişi olduğunu hesaplar.

    Döner: (seq[order_number] -> kaçıncı, totals[customer_id] -> toplam sipariş).
    """
    rows = db.execute(
        select(Order.order_number, Order.customer_id, Order.order_date)
        .order_by(Order.order_date, Order.order_number)
    ).all()
    counter: dict = defaultdict(int)
    seq: dict = {}
    for r in rows:
        if r.customer_id:
            counter[r.customer_id] += 1
            seq[r.order_number] = counter[r.customer_id]
        else:
            seq[r.order_number] = None
    return seq, dict(counter)


def list_orders(db: Session, limit: int = 5000) -> list[dict]:
    """Tüm siparişler — yeniden eskiye, müşteri adı ve kaçıncı alışveriş bilgisiyle."""
    seq, totals = _purchase_sequence(db)
    item_count = (
        select(OrderItem.order_number, func.count().label("n"))
        .group_by(OrderItem.order_number)
        .subquery()
    )
    q = (
        select(
            Order.order_number, Order.order_date, Order.customer_id,
            Order.customer_email, Order.customer_name, Order.city,
            Order.status, Order.payment_status, Order.total,
            Order.campaign_total, Order.coupon_code,
            Customer.full_name,
            func.coalesce(item_count.c.n, 0).label("item_count"),
        )
        .outerjoin(Customer, Order.customer_id == Customer.id)
        .outerjoin(item_count, Order.order_number == item_count.c.order_number)
        .order_by(Order.order_date.desc())
        .limit(limit)
    )
    out = []
    for r in db.execute(q).all():
        name = r.full_name or r.customer_name or r.customer_email or "—"
        discount = r.campaign_total or 0
        out.append({
            "order_number": r.order_number,
            "order_date": r.order_date,
            "customer_id": r.customer_id,
            "customer_name": name,
            "city": r.city,
            "status": r.status,
            "payment_status": r.payment_status,
            "total": r.total,
            "item_count": r.item_count,
            "purchase_index": seq.get(r.order_number),
            "customer_total_orders": totals.get(r.customer_id) if r.customer_id else None,
            "campaign_discount": round(discount, 2) if discount else 0,
            "coupon_code": r.coupon_code,
            "discounted": bool(discount > 0 or r.coupon_code),
        })
    return out


def order_detail(db: Session, order_number: str) -> dict | None:
    """Bir siparişin başlığı + içindeki ürünler (ne alınmış)."""
    o = db.get(Order, order_number)
    if o is None:
        return None
    name = o.customer_name or o.customer_email or "—"
    if o.customer_id:
        cust = db.get(Customer, o.customer_id)
        if cust and cust.full_name:
            name = cust.full_name
    items = db.execute(
        select(OrderItem).where(OrderItem.order_number == order_number)
    ).scalars().all()
    return {
        "order_number": o.order_number,
        "order_date": o.order_date,
        "customer_name": name,
        "customer_email": o.customer_email,
        "city": o.city,
        "district": o.district,
        "status": o.status,
        "payment_status": o.payment_status,
        "payment_method": o.payment_method,
        "subtotal": o.subtotal,
        "shipping_price": o.shipping_price,
        "campaign_discount": round(o.campaign_total, 2) if o.campaign_total else 0,
        "coupon_code": o.coupon_code,
        "total": o.total,
        "items": [
            {
                "product_name": it.product_name,
                "quantity": it.quantity,
                "unit_price": it.unit_price,
                "line_total": (it.quantity or 0) * (it.unit_price or 0)
                if it.unit_price is not None else None,
            }
            for it in items
        ],
    }


def order_trend(db: Session, period: str = "day") -> list[dict]:
    """Zaman içinde sipariş sayısı ve net ciro (iptal/iade hariç)."""
    fmt = _PERIOD_FMT.get(period, _PERIOD_FMT["day"])
    bucket = func.strftime(fmt, Order.order_date).label("bucket")
    q = (
        select(
            bucket,
            func.count().label("orders"),
            func.coalesce(func.sum(Order.total), 0).label("revenue"),
        )
        .where(Order.status.notin_(EXCLUDED_STATUSES))
        .where(Order.order_date.isnot(None))
        .group_by(bucket)
        .order_by(bucket)
    )
    return [
        {"period": r.bucket, "orders": r.orders, "revenue": round(r.revenue, 2)}
        for r in db.execute(q).all()
    ]
