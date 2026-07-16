"""CRM / Kampanya servis katmanı.

- Müşteri CRM listesi (sipariş istatistikleri + otomatik kampanya uygunluğu +
  kupon süre durumu ile birleşik)
- CRM kaydı güncelleme (yazılabilir, kalıcı)
- Özet KPI'lar (aranacaklar, süresi biten kuponlar, kampanya dağılımı)
- Kampanya ROI (sipariş Kampanya Toplamı'ndan)
"""
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Customer, CustomerCRM, Order
from app.services.constants import (
    DEFAULT_CHURN_DAYS, EXCLUDED_STATUSES, WELCOME_CAMPAIGN_START,
)

_NET = Order.status.notin_(EXCLUDED_STATUSES)
_WELCOME_START = datetime.strptime(WELCOME_CAMPAIGN_START, "%Y-%m-%d")

# Otomatik kampanya uygunluk eşikleri
LOYALTY_MIN_ORDERS = 5          # Sadakat (%10)
WINBACK_DAYS = DEFAULT_CHURN_DAYS  # 25K+%5 (90+ gün inaktif)
WELCOME_MAX_DAYS = 30          # Hoşgeldin (yeni müşteri)
COUPON_SOON_DAYS = 14         # "yakında bitiyor" eşiği

_PERIOD_FMT = {"day": "%Y-%m-%d", "week": "%Y-%W", "month": "%Y-%m"}


def _reference_date(db: Session) -> datetime:
    return db.scalar(select(func.max(Order.order_date))) or datetime.now()


def _order_stats(db: Session) -> dict[str, dict]:
    """Kanonik müşteri başına net sipariş istatistikleri."""
    ref = _reference_date(db)
    rows = db.execute(
        select(
            Order.customer_id,
            func.count().label("orders"),
            func.max(Order.order_date).label("last_order"),
            func.min(Order.order_date).label("first_order"),
            func.coalesce(func.sum(Order.total), 0).label("monetary"),
        )
        .where(_NET).where(Order.customer_id.isnot(None))
        .group_by(Order.customer_id)
    ).all()
    out = {}
    for r in rows:
        recency = (ref - r.last_order).days if r.last_order else None
        out[r.customer_id] = {
            "orders": r.orders,
            "last_order": r.last_order,
            "first_order": r.first_order,
            "monetary": round(float(r.monetary), 2),
            "recency_days": recency,
        }
    return out


def _eligibility(st: dict) -> list[str]:
    """Sipariş geçmişine göre müşterinin uygun olduğu kampanyalar.

    - Sadakat: 5+ sipariş
    - 25K+%5: yalnızca 90+ gündür alışveriş yapmayanlar
    - Hoşgeldin: yalnızca kampanya başlangıcından SONRA ilk siparişini verenler
    """
    elig = []
    orders = st.get("orders", 0)
    rec = st.get("recency_days")
    first = st.get("first_order")
    if orders >= LOYALTY_MIN_ORDERS:
        elig.append("Sadakat")
    if rec is not None and rec >= WINBACK_DAYS:
        elig.append("25K+%5")
    if first is not None and first >= _WELCOME_START:
        elig.append("Hoşgeldin")
    return elig


def _coupon_status(expiry: datetime | None, now: datetime) -> str | None:
    """Kupon süre durumu: expired / expiring / active / None."""
    if expiry is None:
        return None
    if expiry < now:
        return "expired"
    if expiry <= now + timedelta(days=COUPON_SOON_DAYS):
        return "expiring"
    return "active"


def _crm_dict(crm: CustomerCRM | None) -> dict:
    if crm is None:
        return {
            "status": None, "campaign_type": None, "to_call": False,
            "called": False, "last_call_date": None, "call_outcome": None,
            "coupon_sent": False, "coupon_code": None, "coupon_sent_date": None,
            "coupon_expiry_date": None, "coupon_used": None, "note": None,
            "updated_at": None,
        }
    return {
        "status": crm.status, "campaign_type": crm.campaign_type,
        "to_call": crm.to_call, "called": crm.called,
        "last_call_date": crm.last_call_date, "call_outcome": crm.call_outcome,
        "coupon_sent": crm.coupon_sent, "coupon_code": crm.coupon_code,
        "coupon_sent_date": crm.coupon_sent_date,
        "coupon_expiry_date": crm.coupon_expiry_date, "coupon_used": crm.coupon_used,
        "note": crm.note, "updated_at": crm.updated_at,
    }


def list_customers(
    db: Session, status: str | None = None, campaign: str | None = None,
    search: str | None = None, only_to_call: bool = False,
    coupon: str | None = None,
) -> list[dict]:
    """Tüm müşteriler + CRM + sipariş istatistikleri + uygunluk + kupon durumu."""
    now = datetime.now()
    stats = _order_stats(db)
    crm_map = {c.customer_id: c for c in db.execute(select(CustomerCRM)).scalars()}
    customers = db.execute(select(Customer)).scalars().all()

    rows = []
    for c in customers:
        st = stats.get(c.id, {"orders": 0, "last_order": None, "monetary": 0, "recency_days": None})
        crm = crm_map.get(c.id)
        cd = _crm_dict(crm)
        cstatus = _coupon_status(cd["coupon_expiry_date"], now)
        # Arama sonrası tekrar sipariş verdi mi (son sipariş > son arama)
        reordered = bool(
            cd["last_call_date"] and st["last_order"]
            and st["last_order"] > cd["last_call_date"]
        )
        rows.append({
            "customer_id": c.id,
            "name": c.full_name or c.id,
            "email": c.primary_email or c.id,
            "phone": c.phone,
            "city": c.city,
            "orders": st["orders"],
            "last_order": st["last_order"],
            "monetary": st["monetary"],
            "recency_days": st["recency_days"],
            "eligibility": _eligibility(st),
            "coupon_status": cstatus,
            "reordered_after_call": reordered,
            **cd,
        })

    # Filtreler
    def keep(r):
        if status and r["status"] != status:
            return False
        if campaign and r["campaign_type"] != campaign:
            return False
        if only_to_call and not r["to_call"]:
            return False
        if coupon and r["coupon_status"] != coupon:
            return False
        if search:
            s = search.lower()
            if s not in (r["name"] or "").lower() and s not in (r["email"] or "").lower():
                return False
        return True

    rows = [r for r in rows if keep(r)]
    rows.sort(key=lambda r: r["monetary"], reverse=True)
    return rows


_DATE_FIELDS = {"last_call_date", "coupon_sent_date", "coupon_expiry_date"}
_BOOL_FIELDS = {"to_call", "called", "coupon_sent"}
_STR_FIELDS = {"status", "campaign_type", "coupon_code", "note",
               "call_outcome", "coupon_used"}


def update_customer(db: Session, customer_id: str, fields: dict) -> dict:
    """CRM kaydını oluşturur/günceller (upsert)."""
    crm = db.get(CustomerCRM, customer_id)
    if crm is None:
        cust = db.get(Customer, customer_id)
        crm = CustomerCRM(
            customer_id=customer_id,
            email=cust.primary_email if cust else customer_id,
        )
        db.add(crm)

    for k, v in fields.items():
        if v is None and k not in _STR_FIELDS and k not in _DATE_FIELDS:
            continue
        if k in _DATE_FIELDS:
            setattr(crm, k, _parse_date(v))
        elif k in _BOOL_FIELDS:
            setattr(crm, k, bool(v))
        elif k in _STR_FIELDS:
            setattr(crm, k, v)
    crm.updated_at = datetime.now()
    db.commit()
    return _crm_dict(crm) | {"customer_id": customer_id}


def _parse_date(v):
    if not v:
        return None
    if isinstance(v, datetime):
        return v
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(str(v)[:19], fmt)
        except ValueError:
            continue
    return None


def summary(db: Session) -> dict:
    """CRM özet KPI'ları."""
    rows = list_customers(db)
    to_call = sum(1 for r in rows if r["to_call"])
    called = sum(1 for r in rows if r["called"])
    expired = sum(1 for r in rows if r["coupon_status"] == "expired")
    expiring = sum(1 for r in rows if r["coupon_status"] == "expiring")
    camp: dict[str, int] = {}
    for r in rows:
        if r["campaign_type"]:
            camp[r["campaign_type"]] = camp.get(r["campaign_type"], 0) + 1
    elig: dict[str, int] = {}
    for r in rows:
        for e in r["eligibility"]:
            elig[e] = elig.get(e, 0) + 1
    # Eksik kupon: uygun ama kuponu/araması olmayanlar
    gap_count = sum(
        1 for r in rows
        if r["eligibility"] and not (r["coupon_sent"] or r["coupon_code"] or r["called"])
    )
    return {
        "total_customers": len(rows),
        "to_call": to_call,
        "called": called,
        "coupon_expired": expired,
        "coupon_expiring": expiring,
        "gap_count": gap_count,
        "campaign_distribution": [{"campaign": k, "count": v} for k, v in
                                  sorted(camp.items(), key=lambda x: -x[1])],
        "eligibility": [{"campaign": k, "count": v} for k, v in
                        sorted(elig.items(), key=lambda x: -x[1])],
    }


def coupon_gaps(db: Session, campaign: str | None = None) -> dict:
    """Tutarsızlık raporu: bir kampanyaya UYGUN olduğu hâlde kuponu olmayan müşteriler.

    Akış kuralı: ilk siparişini veren müşteriye Hoşgeldin kuponu, 5+ siparişe
    Sadakat, 90+ gün inaktife 25.000TL+%5 kuponu tanımlanmalı. Burada bu kupon
    tanımlanmamış (gönderilmemiş ve kodu olmayan) uygun müşteriler listelenir.
    """
    def has_coupon(r):
        # Arandıysa kupon zaten tanımlanmıştır; kupon gönderilmiş/kodu varsa da öyle.
        return bool(r["coupon_sent"] or r["coupon_code"] or r["called"])

    rows = list_customers(db)
    gaps = [r for r in rows if r["eligibility"] and not has_coupon(r)]

    by_campaign: dict[str, int] = {}
    for r in gaps:
        for e in r["eligibility"]:
            by_campaign[e] = by_campaign.get(e, 0) + 1

    if campaign:
        gaps = [r for r in gaps if campaign in r["eligibility"]]

    keep = ("customer_id", "name", "email", "phone", "orders", "monetary",
            "recency_days", "last_order", "eligibility", "campaign_type",
            "coupon_sent", "coupon_code", "called", "to_call",
            "status", "last_call_date", "coupon_sent_date",
            "coupon_expiry_date", "note")
    customers = [{k: r[k] for k in keep} for r in gaps]
    customers.sort(key=lambda r: r["monetary"], reverse=True)

    return {
        "total_without_coupon": sum(1 for r in rows if not has_coupon(r)),
        "gap_count": len(customers),
        "by_campaign": [{"campaign": k, "count": v}
                        for k, v in sorted(by_campaign.items(), key=lambda x: -x[1])],
        "customers": customers,
    }


def _date_conds(start: str | None, end: str | None) -> list:
    conds = []
    if start:
        conds.append(Order.order_date >= start)
    if end:
        conds.append(Order.order_date < end)
    return conds


def previous_month_called(db: Session) -> dict:
    """Bir önceki takvim ayında aranan müşteriler (çağrı sonucu + tekrar sipariş)."""
    now = datetime.now()
    pm = now.month - 1 or 12
    py = now.year if now.month > 1 else now.year - 1
    start = datetime(py, pm, 1)
    end = datetime(now.year, now.month, 1)
    rows = [
        r for r in list_customers(db)
        if r["last_call_date"] and start <= r["last_call_date"] < end
    ]
    rows.sort(key=lambda r: r["last_call_date"], reverse=True)
    return {"period": f"{py:04d}-{pm:02d}", "count": len(rows), "customers": rows}


def valuable_customers(db: Session, start: str | None = None,
                       end: str | None = None, limit: int = 20) -> list[dict]:
    """En değerli müşteriler — seçili dönemdeki harcamaya göre, CRM bilgisiyle."""
    dc = _date_conds(start, end)
    q = (
        select(
            Order.customer_id, Customer.full_name,
            func.coalesce(func.sum(Order.total), 0).label("revenue"),
            func.count().label("orders"),
        )
        .outerjoin(Customer, Order.customer_id == Customer.id)
        .where(_NET, *dc).where(Order.customer_id.isnot(None))
        .group_by(Order.customer_id)
        .order_by(func.sum(Order.total).desc())
        .limit(limit)
    )
    crm_map = {c.customer_id: c for c in db.execute(select(CustomerCRM)).scalars()}
    out = []
    for r in db.execute(q).all():
        crm = crm_map.get(r.customer_id)
        out.append({
            "customer_id": r.customer_id,
            "name": r.full_name or r.customer_id,
            "revenue": round(float(r.revenue), 2),
            "orders": r.orders,
            "campaign_type": crm.campaign_type if crm else None,
            "called": bool(crm and crm.called),
            "status": crm.status if crm else None,
        })
    return out


def discount_impact(db: Session, start: str | None = None,
                    end: str | None = None) -> dict:
    """İndirimin ciroya etkisi — data'daki indirimli siparişlerden (Kampanya Toplamı>0).

    İndirimli sipariş = Kampanya Toplamı (campaign_total) > 0 olan sipariş.
    """
    dc = []
    if start:
        dc.append(Order.order_date >= start)
    if end:
        dc.append(Order.order_date < end)

    total_revenue = db.scalar(
        select(func.coalesce(func.sum(Order.total), 0)).where(_NET, *dc)
    ) or 0
    total_orders = db.scalar(select(func.count()).select_from(Order).where(_NET, *dc)) or 0

    disc_filter = [Order.campaign_total.isnot(None), Order.campaign_total > 0]
    discounted_orders = db.scalar(
        select(func.count()).select_from(Order).where(_NET, *dc, *disc_filter)
    ) or 0
    total_discount = db.scalar(
        select(func.coalesce(func.sum(Order.campaign_total), 0)).where(_NET, *dc, *disc_filter)
    ) or 0
    discounted_revenue = db.scalar(
        select(func.coalesce(func.sum(Order.total), 0)).where(_NET, *dc, *disc_filter)
    ) or 0

    return {
        "total_orders": total_orders,
        "total_revenue": round(total_revenue, 2),
        "discounted_orders": discounted_orders,
        "discounted_revenue": round(discounted_revenue, 2),
        "total_discount": round(total_discount, 2),
        "discount_pct_of_revenue": round(total_discount * 100 / total_revenue, 2) if total_revenue else 0,
        "discounted_order_pct": round(discounted_orders * 100 / total_orders, 1) if total_orders else 0,
        "avg_discount_per_order": round(total_discount / discounted_orders, 2) if discounted_orders else 0,
    }


def campaign_roi(db: Session, period: str = "month") -> list[dict]:
    """Kampanya indirimi etkisi — siparişlerdeki Kampanya Toplamı'ndan.

    Gruplama Python tarafında (SQLite/PostgreSQL bağımsız).
    """
    fmt = _PERIOD_FMT.get(period, _PERIOD_FMT["month"])
    rows = db.execute(
        select(Order.order_date, Order.campaign_total, Order.total)
        .where(_NET)
        .where(Order.campaign_total.isnot(None))
        .where(Order.campaign_total > 0)
        .where(Order.order_date.isnot(None))
    ).all()
    buckets: dict[str, dict] = defaultdict(
        lambda: {"discounted_orders": 0, "total_discount": 0.0, "revenue": 0.0}
    )
    for od, disc, total in rows:
        b = buckets[od.strftime(fmt)]
        b["discounted_orders"] += 1
        b["total_discount"] += disc or 0
        b["revenue"] += total or 0
    return [
        {
            "period": k,
            "discounted_orders": v["discounted_orders"],
            "total_discount": round(v["total_discount"], 2),
            "revenue": round(v["revenue"], 2),
        }
        for k, v in sorted(buckets.items())
    ]
