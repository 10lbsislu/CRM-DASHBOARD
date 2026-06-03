"""CRM / Kampanya servis katmanı.

- Müşteri CRM listesi (sipariş istatistikleri + otomatik kampanya uygunluğu +
  kupon süre durumu ile birleşik)
- CRM kaydı güncelleme (yazılabilir, kalıcı)
- Özet KPI'lar (aranacaklar, süresi biten kuponlar, kampanya dağılımı)
- Kampanya ROI (sipariş Kampanya Toplamı'ndan)
"""
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Customer, CustomerCRM, Order
from app.services.constants import DEFAULT_CHURN_DAYS, EXCLUDED_STATUSES

_NET = Order.status.notin_(EXCLUDED_STATUSES)

# Otomatik kampanya uygunluk eşikleri
LOYALTY_MIN_ORDERS = 5          # Sadakat (%10)
WINBACK_DAYS = DEFAULT_CHURN_DAYS  # Nerdesin / 25K+%5 (90+ gün inaktif)
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
            "monetary": round(float(r.monetary), 2),
            "recency_days": recency,
        }
    return out


def _eligibility(st: dict) -> list[str]:
    """Sipariş geçmişine göre müşterinin uygun olduğu kampanyalar."""
    elig = []
    orders = st.get("orders", 0)
    rec = st.get("recency_days")
    if orders >= LOYALTY_MIN_ORDERS:
        elig.append("Sadakat")
    if rec is not None and rec >= WINBACK_DAYS:
        elig.append("Nerdesin")
        elig.append("25K+%5")
    if orders == 1 and rec is not None and rec <= WELCOME_MAX_DAYS:
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
            "called": False, "last_call_date": None, "coupon_sent": False,
            "coupon_code": None, "coupon_sent_date": None,
            "coupon_expiry_date": None, "note": None, "updated_at": None,
        }
    return {
        "status": crm.status, "campaign_type": crm.campaign_type,
        "to_call": crm.to_call, "called": crm.called,
        "last_call_date": crm.last_call_date, "coupon_sent": crm.coupon_sent,
        "coupon_code": crm.coupon_code, "coupon_sent_date": crm.coupon_sent_date,
        "coupon_expiry_date": crm.coupon_expiry_date, "note": crm.note,
        "updated_at": crm.updated_at,
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
_STR_FIELDS = {"status", "campaign_type", "coupon_code", "note"}


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
    return {
        "total_customers": len(rows),
        "to_call": to_call,
        "called": called,
        "coupon_expired": expired,
        "coupon_expiring": expiring,
        "campaign_distribution": [{"campaign": k, "count": v} for k, v in
                                  sorted(camp.items(), key=lambda x: -x[1])],
        "eligibility": [{"campaign": k, "count": v} for k, v in
                        sorted(elig.items(), key=lambda x: -x[1])],
    }


def campaign_roi(db: Session, period: str = "month") -> list[dict]:
    """Kampanya indirimi etkisi — siparişlerdeki Kampanya Toplamı'ndan."""
    fmt = _PERIOD_FMT.get(period, _PERIOD_FMT["month"])
    bucket = func.strftime(fmt, Order.order_date).label("bucket")
    q = (
        select(
            bucket,
            func.count().label("discounted_orders"),
            func.coalesce(func.sum(Order.campaign_total), 0).label("total_discount"),
            func.coalesce(func.sum(Order.total), 0).label("revenue"),
        )
        .where(_NET)
        .where(Order.campaign_total.isnot(None))
        .where(Order.campaign_total > 0)
        .where(Order.order_date.isnot(None))
        .group_by(bucket).order_by(bucket)
    )
    return [
        {
            "period": r.bucket,
            "discounted_orders": r.discounted_orders,
            "total_discount": round(r.total_discount, 2),
            "revenue": round(r.revenue, 2),
        }
        for r in db.execute(q).all()
    ]
