"""Bölüm 3: Müşteri alışkanlıkları — RFM, en değerli müşteriler, churn riski,
yeni/tekrar eden müşteri takibi."""
from collections import defaultdict
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analytics.rfm import CustomerOrders, compute_rfm
from app.models import Customer, Order
from app.services.constants import DEFAULT_CHURN_DAYS, EXCLUDED_STATUSES

_NET = Order.status.notin_(EXCLUDED_STATUSES)

_PERIOD_FMT = {"day": "%Y-%m-%d", "week": "%Y-%W", "month": "%Y-%m"}


def _reference_date(db: Session) -> datetime:
    """RFM/churn için 'şimdi' kabul edilen tarih = veri setindeki en son sipariş."""
    ref = db.scalar(select(func.max(Order.order_date)))
    return ref or datetime.now()


def _customer_orders(db: Session) -> list[CustomerOrders]:
    q = (
        select(
            Order.customer_id,
            func.max(Order.order_date).label("last_order"),
            func.count().label("freq"),
            func.coalesce(func.sum(Order.total), 0).label("monetary"),
        )
        .where(_NET)
        .where(Order.customer_id.isnot(None))
        .where(Order.order_date.isnot(None))
        .group_by(Order.customer_id)
    )
    return [
        CustomerOrders(
            email=r.customer_id,  # kanonik müşteri kimliği (birincil e-posta)
            last_order_date=r.last_order,
            frequency=r.freq,
            monetary=float(r.monetary),
        )
        for r in db.execute(q).all()
    ]


def _name_map(db: Session) -> dict[str, str]:
    return {
        c.id: (c.full_name or c.id)
        for c in db.execute(select(Customer.id, Customer.full_name)).all()
    }


def rfm_table(db: Session) -> dict:
    """Tüm müşterilerin RFM tablosu + segment dağılımı."""
    rows = compute_rfm(_customer_orders(db), _reference_date(db))
    names = _name_map(db)
    for r in rows:
        r["name"] = names.get(r["email"], r["email"])

    dist: dict[str, int] = {}
    for r in rows:
        dist[r["segment"]] = dist.get(r["segment"], 0) + 1
    segment_distribution = [
        {"segment": k, "count": v}
        for k, v in sorted(dist.items(), key=lambda x: x[1], reverse=True)
    ]
    return {"customers": rows, "segment_distribution": segment_distribution}


def top_customers(db: Session, limit: int = 10) -> list[dict]:
    """En değerli müşteriler — toplam net harcamaya göre."""
    rows = compute_rfm(_customer_orders(db), _reference_date(db))
    names = _name_map(db)
    rows.sort(key=lambda x: x["monetary"], reverse=True)
    top = rows[:limit]
    for r in top:
        r["name"] = names.get(r["email"], r["email"])
    return top


def churn_risk(db: Session, days: int = DEFAULT_CHURN_DAYS) -> dict:
    """Son siparişinden 'days' günden fazla geçen müşteriler (churn riski)."""
    ref = _reference_date(db)
    names = _name_map(db)
    at_risk = []
    for c in _customer_orders(db):
        gap = max(0, (ref - c.last_order_date).days)
        if gap >= days:
            at_risk.append({
                "email": c.email,
                "name": names.get(c.email, c.email),
                "last_order_date": c.last_order_date,
                "days_since_last_order": gap,
                "frequency": c.frequency,
                "monetary": round(c.monetary, 2),
            })
    at_risk.sort(key=lambda x: x["monetary"], reverse=True)
    return {
        "reference_date": ref,
        "threshold_days": days,
        "count": len(at_risk),
        "customers": at_risk,
    }


def _net_orders_chrono(db: Session) -> list:
    """Net siparişleri kronolojik sırada döner (yeni/tekrar tespiti için)."""
    q = (
        select(
            Order.order_number, Order.customer_id,
            Order.order_date, Order.total,
        )
        .where(_NET)
        .where(Order.customer_id.isnot(None))
        .where(Order.order_date.isnot(None))
        .order_by(Order.order_date, Order.order_number)
    )
    return db.execute(q).all()


def new_vs_returning(db: Session, period: str = "month") -> list[dict]:
    """Dönem bazında YENİ (ilk kez alan) vs TEKRAR EDEN sipariş ve ciro."""
    fmt = _PERIOD_FMT.get(period, _PERIOD_FMT["month"])
    seen: set[str] = set()
    buckets: dict[str, dict] = defaultdict(
        lambda: {"new_customers": 0, "repeat_orders": 0,
                 "new_revenue": 0.0, "repeat_revenue": 0.0}
    )
    for r in _net_orders_chrono(db):
        key = r.order_date.strftime(fmt)
        b = buckets[key]
        total = r.total or 0
        if r.customer_id not in seen:          # bu müşterinin ilk siparişi
            seen.add(r.customer_id)
            b["new_customers"] += 1
            b["new_revenue"] += total
        else:                                   # tekrar siparişi
            b["repeat_orders"] += 1
            b["repeat_revenue"] += total
    return [
        {"period": k, **{kk: round(vv, 2) if isinstance(vv, float) else vv
                         for kk, vv in v.items()}}
        for k, v in sorted(buckets.items())
    ]


def daily_activity(db: Session, date: str) -> dict:
    """Belirli bir günün siparişleri: her biri ilk alışveriş mi, tekrar mı.

    date: 'YYYY-MM-DD'. Müşterinin o siparişten ÖNCE net siparişi yoksa 'yeni'.
    """
    names = _name_map(db)
    prior_count: dict[str, int] = defaultdict(int)
    new_list, returning_list = [], []
    for r in _net_orders_chrono(db):  # kronolojik
        day = r.order_date.strftime("%Y-%m-%d")
        cid = r.customer_id
        before = prior_count[cid]
        if day == date:
            entry = {
                "order_number": r.order_number,
                "customer_id": cid,
                "name": names.get(cid, cid),
                "order_date": r.order_date,
                "total": r.total,
                "previous_orders": before,
            }
            (new_list if before == 0 else returning_list).append(entry)
        prior_count[cid] += 1  # bu siparişi say
    return {
        "date": date,
        "new_count": len(new_list),
        "returning_count": len(returning_list),
        "new_customers": new_list,
        "returning_customers": returning_list,
    }


def loyalty_summary(db: Session, start: str | None = None,
                    end: str | None = None) -> dict:
    """Sadakat: tek seferlik vs tekrar eden müşteri, tekrar oranı.

    Tarih aralığı verilirse yalnızca o dönemdeki siparişlere göre hesaplanır.
    """
    dc = []
    if start:
        dc.append(Order.order_date >= start)
    if end:
        dc.append(Order.order_date < end)
    rows = db.execute(
        select(Order.customer_id, func.count())
        .where(_NET, *dc).where(Order.customer_id.isnot(None))
        .group_by(Order.customer_id)
    ).all()
    counts = [c for _, c in rows]
    n = len(counts) or 1
    once = sum(1 for c in counts if c == 1)
    repeat = len(counts) - once
    return {
        "total_customers": len(counts),
        "one_time": once,
        "repeat": repeat,
        "repeat_rate": round(repeat * 100 / n, 1),
        "avg_orders_per_customer": round(sum(counts) / n, 2),
    }
