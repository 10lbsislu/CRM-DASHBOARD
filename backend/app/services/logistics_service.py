"""Lojistik analizi — donuk/soğuk karışık siparişler ve ekstra kargo maliyeti.

Donuk ve soğuk ürünler ayrı kargoyla gönderildiği için, hem donuk hem soğuk
içeren ("karışık") siparişler ikinci bir gönderi maliyeti doğurur.
"""
from collections import Counter, defaultdict
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analytics.logistics import classify_category
from app.models import Customer, LogisticsConfig, Order, OrderItem
from app.services.constants import EXCLUDED_STATUSES, SHIPPING_DONUK_TL


def _configs(db: Session) -> dict[str, LogisticsConfig]:
    return {c.month: c for c in db.execute(select(LogisticsConfig)).scalars()}


def _expected_shipping(cfg: LogisticsConfig | None, total: float) -> float | None:
    """Aya özel kurala göre müşteriden ALINMASI GEREKEN kargo. Kural yoksa None."""
    if cfg is None or cfg.low_threshold is None or cfg.free_threshold is None:
        return None
    if total >= cfg.free_threshold:
        return 0.0
    if total < cfg.low_threshold:
        return cfg.low_fee or 0.0
    return cfg.mid_fee or 0.0


def config_dict(c: LogisticsConfig) -> dict:
    return {
        "month": c.month, "shipping_cost": c.shipping_cost,
        "low_threshold": c.low_threshold, "low_fee": c.low_fee,
        "mid_fee": c.mid_fee, "free_threshold": c.free_threshold,
    }

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

    # Kargo ekonomisi — aya özel config (varsa) ile hesaplanır
    cfgs = _configs(db)
    shipments = len(single) + 2 * len(mixed)
    our_cost = 0.0
    collected = 0.0
    extra = 0.0           # karışıktan doğan ekstra (ikinci) gönderi maliyeti
    rule_based = False    # en az bir siparişte kademeli kural uygulandı mı
    tiers = {k: {"orders": 0, "our_cost": 0.0, "collected": 0.0}
             for k in ("free", "mid", "low", "none")}
    for o in orders:
        month = o["date"].strftime("%Y-%m") if o["date"] else None
        cfg = cfgs.get(month)
        cost_per = cfg.shipping_cost if cfg else SHIPPING_DONUK_TL
        is_mixed = o["type"] == "mixed"
        order_cost = (2 if is_mixed else 1) * cost_per
        our_cost += order_cost
        if is_mixed:
            extra += cost_per
        exp = _expected_shipping(cfg, o["total"])
        if exp is not None:
            rule_based = True
            cs = exp
        else:
            cs = o["shipping"] or 0
        o["_cust_ship"] = cs
        collected += cs

        # Kargo kademesi (aya özel kural varsa)
        if cfg and cfg.low_threshold is not None and cfg.free_threshold is not None:
            if o["total"] >= cfg.free_threshold:
                tk = "free"
            elif o["total"] < cfg.low_threshold:
                tk = "low"
            else:
                tk = "mid"
        else:
            tk = "none"
        tb = tiers[tk]
        tb["orders"] += 1
        tb["our_cost"] += order_cost
        tb["collected"] += cs

    net_cost = our_cost - collected

    _tier_labels = {
        "free": "Ücretsiz kargo", "mid": "Orta kademe",
        "low": "Düşük kademe (alt eşik altı)", "none": "Kural tanımsız",
    }
    tier_breakdown = [
        {
            "key": k, "label": _tier_labels[k], "orders": tiers[k]["orders"],
            "our_cost": round(tiers[k]["our_cost"], 2),
            "collected": round(tiers[k]["collected"], 2),
            "net": round(tiers[k]["our_cost"] - tiers[k]["collected"], 2),
            "net_pct": round((tiers[k]["our_cost"] - tiers[k]["collected"]) * 100 / net_cost, 1)
            if net_cost else 0,
        }
        for k in ("free", "mid", "low", "none") if tiers[k]["orders"]
    ]

    def _avg_ship(group):
        return round(sum(o["_cust_ship"] for o in group) / len(group), 0) if group else 0

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
        "shipping_per_order": round(our_cost / shipments) if shipments else SHIPPING_DONUK_TL,
        "rule_based_shipping": rule_based,
        "tier_breakdown": tier_breakdown,
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


def list_configs(db: Session) -> dict:
    """Tüm aylar için kayıtlı lojistik ayarları (ay -> config)."""
    return {c.month: config_dict(c) for c in db.execute(select(LogisticsConfig)).scalars()}


def _validate(data: dict) -> tuple[list[str], list[str]]:
    """Döner: (hard_errors, warnings). Hard error varsa kayıt engellenir."""
    errors, warns = [], []
    sc = data.get("shipping_cost")
    lt, lf = data.get("low_threshold"), data.get("low_fee")
    mf, ft = data.get("mid_fee"), data.get("free_threshold")
    if sc is None or sc < 0:
        errors.append("Gönderi maliyeti (bizim kargo) 0 veya pozitif olmalı.")
    for name, v in [("Alt eşik", lt), ("Alt ücret", lf), ("Orta ücret", mf), ("Ücretsiz eşiği", ft)]:
        if v is not None and v < 0:
            errors.append(f"{name} negatif olamaz.")
    if lt is not None and ft is not None and lt >= ft:
        errors.append("Alt eşik, ücretsiz eşiğinden küçük olmalı (örn. 5000 < 20000).")
    if lf is not None and mf is not None and mf > lf:
        warns.append("Orta ücret alt ücretten yüksek — genelde tersi beklenir.")
    return errors, warns


def _consistency_warning(db: Session, month: str, data: dict) -> str | None:
    """O ayki gerçek kargo bedelleri girilen kurala uyuyor mu? Uymayanları say."""
    class _C:  # geçici config benzeri
        low_threshold = data.get("low_threshold")
        free_threshold = data.get("free_threshold")
        low_fee = data.get("low_fee")
        mid_fee = data.get("mid_fee")
    rows = db.execute(
        select(Order.total, Order.shipping_price)
        .where(_NET).where(func.strftime("%Y-%m", Order.order_date) == month)
        .where(Order.total.isnot(None))
    ).all()
    mismatch = 0
    for total, ship in rows:
        exp = _expected_shipping(_C, total or 0)
        if exp is None:
            return None
        if abs((ship or 0) - exp) > 1:
            mismatch += 1
    if mismatch:
        return (f"{mismatch}/{len(rows)} siparişte gerçekte alınan kargo, girilen kurala "
                f"uymuyor (geçmiş siparişler eski kuralla alınmış olabilir).")
    return None


def save_config(db: Session, month: str, data: dict) -> dict:
    """Aya özel lojistik ayarını kaydeder (doğrulama + tutarlılık uyarısı)."""
    errors, warns = _validate(data)
    if errors:
        return {"ok": False, "errors": errors, "warnings": warns}
    cw = _consistency_warning(db, month, data)
    if cw:
        warns.append(cw)

    cfg = db.get(LogisticsConfig, month)
    if cfg is None:
        cfg = LogisticsConfig(month=month)
        db.add(cfg)
    cfg.shipping_cost = data["shipping_cost"]
    cfg.low_threshold = data.get("low_threshold")
    cfg.low_fee = data.get("low_fee")
    cfg.mid_fee = data.get("mid_fee")
    cfg.free_threshold = data.get("free_threshold")
    cfg.updated_at = datetime.now()
    db.commit()
    return {"ok": True, "errors": [], "warnings": warns, "config": config_dict(cfg)}


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
