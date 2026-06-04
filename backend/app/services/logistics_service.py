"""Lojistik analizi — donuk/soğuk karışık siparişler ve ekstra kargo maliyeti.

Donuk ve soğuk ürünler ayrı kargoyla gönderildiği için, hem donuk hem soğuk
içeren ("karışık") siparişler ikinci bir gönderi maliyeti doğurur.
"""
from collections import Counter, defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.logistics import classify_category
from app.models import Customer, Order, OrderItem
from app.services.constants import EXCLUDED_STATUSES, SHIPPING_DONUK_TL

_NET = Order.status.notin_(EXCLUDED_STATUSES)
_PERIOD_FMT = {"day": "%Y-%m-%d", "week": "%Y-%W", "month": "%Y-%m"}


def _date_conds(start: str | None, end: str | None) -> list:
    conds = []
    if start:
        conds.append(Order.order_date >= start)
    if end:
        conds.append(Order.order_date < end)
    return conds


def _orders(db: Session, start: str | None = None, end: str | None = None) -> list[dict]:
    """Net siparişleri, içerdikleri donuk/soğuk ürünlere göre kategorize eder."""
    q = (
        select(
            OrderItem.order_number, OrderItem.product_name,
            Order.order_date, Order.total, Order.shipping_price, Order.city,
            Customer.full_name, Order.customer_id, Order.customer_name,
        )
        .join(Order, OrderItem.order_number == Order.order_number)
        .outerjoin(Customer, Order.customer_id == Customer.id)
        .where(_NET, *_date_conds(start, end))
        .where(OrderItem.product_name.isnot(None))
    )
    od: dict[str, dict] = {}
    for on, pname, date, total, shipping, city, fname, cid, cname in db.execute(q):
        o = od.get(on)
        if o is None:
            o = od[on] = {
                "order_number": on, "date": date, "total": total or 0,
                "shipping": shipping or 0, "city": city,
                "name": fname or cname or cid or "—",
                "donuk": [], "soguk": [],
            }
        cat = classify_category(pname)
        o["donuk" if cat == "donuk" else "soguk"].append(pname)
    for o in od.values():
        d, s = bool(o["donuk"]), bool(o["soguk"])
        o["type"] = "mixed" if (d and s) else ("donuk" if d else "soguk")
    return list(od.values())


def summary(db: Session, start: str | None = None, end: str | None = None) -> dict:
    orders = _orders(db, start, end)
    by_type = Counter(o["type"] for o in orders)
    mixed = [o for o in orders if o["type"] == "mixed"]
    single = [o for o in orders if o["type"] != "mixed"]
    mixed_revenue = sum(o["total"] for o in mixed)
    total_revenue = sum(o["total"] for o in orders)

    # Kargo ekonomisi
    # Gönderi sayısı: karışık = 2 gönderi, tek tip = 1 gönderi
    shipments = len(single) + 2 * len(mixed)
    our_cost = shipments * SHIPPING_DONUK_TL                 # tahmini kargo giderimiz
    collected = sum(o["shipping"] for o in orders)           # müşteriden alınan kargo
    net_cost = our_cost - collected                          # net kargo yükü (bize kalan)
    extra = len(mixed) * SHIPPING_DONUK_TL                   # karışıktan doğan ekstra gönderi

    def _avg_ship(group):
        return round(sum(o["shipping"] for o in group) / len(group), 0) if group else 0

    # Karışık siparişlerde en sık görünen ürünler (kategoriye göre "sebepler")
    donuk_c: Counter = Counter()
    soguk_c: Counter = Counter()
    for o in mixed:
        for p in set(o["donuk"]):
            donuk_c[p] += 1
        for p in set(o["soguk"]):
            soguk_c[p] += 1

    return {
        "total_orders": len(orders),
        "only_donuk": by_type.get("donuk", 0),
        "only_soguk": by_type.get("soguk", 0),
        "mixed": len(mixed),
        "mixed_pct": round(len(mixed) * 100 / len(orders), 1) if orders else 0,
        "extra_shipping_cost": round(extra, 2),
        "shipping_per_order": SHIPPING_DONUK_TL,
        "mixed_revenue": round(mixed_revenue, 2),
        "mixed_revenue_pct": round(mixed_revenue * 100 / total_revenue, 1) if total_revenue else 0,
        "total_revenue": round(total_revenue, 2),
        # Kargo ekonomisi
        "our_shipping_cost": round(our_cost, 2),     # bizim tahmini giderimiz
        "shipping_collected": round(collected, 2),   # müşteriden alınan kargo
        "net_shipping_cost": round(net_cost, 2),     # net yük (gider - alınan)
        "net_pct": round(net_cost * 100 / total_revenue, 1) if total_revenue else 0,
        "collected_pct": round(collected * 100 / total_revenue, 1) if total_revenue else 0,
        "extra_pct": round(extra * 100 / total_revenue, 1) if total_revenue else 0,
        "avg_mixed_shipping": _avg_ship(mixed),
        "avg_single_shipping": _avg_ship(single),
        "top_donuk_in_mixed": [{"product": p, "count": c} for p, c in donuk_c.most_common(8)],
        "top_soguk_in_mixed": [{"product": p, "count": c} for p, c in soguk_c.most_common(8)],
    }


def mixed_orders(db: Session, start: str | None = None, end: str | None = None) -> list[dict]:
    """Karışık siparişler — tutara göre sıralı, ürün kırılımıyla."""
    rows = [o for o in _orders(db, start, end) if o["type"] == "mixed"]
    rows.sort(key=lambda o: o["total"], reverse=True)
    return [
        {
            "order_number": o["order_number"],
            "date": o["date"],
            "name": o["name"],
            "city": o["city"],
            "total": round(o["total"], 2),
            "donuk_count": len(o["donuk"]),
            "soguk_count": len(o["soguk"]),
            "donuk_products": o["donuk"],
            "soguk_products": o["soguk"],
        }
        for o in rows
    ]


def trend(db: Session, period: str = "month") -> list[dict]:
    """Dönem bazında karışık sipariş sayısı ve ekstra kargo maliyeti."""
    fmt = _PERIOD_FMT.get(period, _PERIOD_FMT["month"])
    buckets: dict[str, dict] = defaultdict(lambda: {"mixed": 0, "total": 0})
    for o in _orders(db):
        if not o["date"]:
            continue
        key = o["date"].strftime(fmt)
        b = buckets[key]
        b["total"] += 1
        if o["type"] == "mixed":
            b["mixed"] += 1
    return [
        {
            "period": k,
            "mixed": v["mixed"],
            "total": v["total"],
            "extra_cost": round(v["mixed"] * SHIPPING_DONUK_TL, 2),
        }
        for k, v in sorted(buckets.items())
    ]
