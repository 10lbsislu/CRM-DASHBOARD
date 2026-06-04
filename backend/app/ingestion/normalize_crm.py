"""CRM verisini tutarlı hale getirir (tutarsızlık denetimini sıfırlar).

Kurallar:
- A: Sadakat atanmış ama <5 sipariş → kampanya+kupon temizlenir
- B: Hoşgeldin atanmış ama ilk sipariş kampanya başlangıcından önce → temizlenir
- C: Nerdesin/25K atanmış ama müşteri aktif (<90g) → kupon gönderiminden SONRA
     sipariş varsa kalır (winback başarılı), yoksa temizlenir
- D: kupon gönderildi ama kod yok → kampanyaya göre kod doldurulur
- E: kupon gönderildi ama gönderim tarihi yok → arama/son sipariş tarihinden doldurulur
- G: arandı ama arama tarihi yok → kupon/son sipariş tarihinden doldurulur
- I: kupon var ama kampanya yok → koddan/uygunluktan türetilir (yoksa kupon temizlenir)
- J: durum boş → son siparişe göre Aktif/Pasif

Kullanım: python -m app.ingestion.normalize_crm
"""
from datetime import datetime

from sqlalchemy import select

from app.database import SessionLocal
from app.models import CustomerCRM
from app.services.crm_service import _WELCOME_START, _eligibility, _order_stats


def _code_for(campaign: str | None) -> str | None:
    if campaign == "Sadakat":
        return "sepette %10"
    if campaign in ("Nerdesin", "25.000TL ve Üstüne %5"):
        return "sepette %5"
    if campaign == "Hoşgeldin":
        return "otomatik sepette"
    return None


def _derive_campaign(code: str | None, st: dict, elig: list[str]) -> str | None:
    c = (code or "").lower()
    if "10" in c and st["orders"] >= 5:
        return "Sadakat"
    if "5" in c or "25.000" in c or "25000" in c:
        return "25.000TL ve Üstüne %5"
    if "otomatik" in c and st.get("first_order") and st["first_order"] >= _WELCOME_START:
        return "Hoşgeldin"
    # Uygunluktan geri dönüş
    if "Sadakat" in elig:
        return "Sadakat"
    if "Nerdesin" in elig:
        return "25.000TL ve Üstüne %5"
    if "Hoşgeldin" in elig:
        return "Hoşgeldin"
    return None


def _clear_campaign(c: CustomerCRM) -> None:
    c.campaign_type = None
    c.coupon_sent = False
    c.coupon_code = None
    c.coupon_sent_date = None
    c.coupon_expiry_date = None


def main():
    db = SessionLocal()
    try:
        stats = _order_stats(db)
        crms = db.execute(select(CustomerCRM)).scalars().all()
        log = {"A": 0, "B": 0, "C_kalan": 0, "C_silinen": 0,
               "D": 0, "E": 0, "G": 0, "I": 0, "I_temiz": 0, "J": 0}

        for c in crms:
            st = stats.get(c.customer_id,
                           {"orders": 0, "recency_days": None, "first_order": None, "last_order": None})
            elig = _eligibility(st)
            last_order = st.get("last_order")

            # A) Sadakat ama <5 sipariş
            if c.campaign_type == "Sadakat" and st["orders"] < 5:
                _clear_campaign(c); log["A"] += 1
            # B) Hoşgeldin ama kampanya öncesi
            elif c.campaign_type == "Hoşgeldin" and st.get("first_order") and st["first_order"] < _WELCOME_START:
                _clear_campaign(c); log["B"] += 1
            # C) Nerdesin/25K ama aktif
            elif c.campaign_type in ("Nerdesin", "25.000TL ve Üstüne %5") and \
                    st["recency_days"] is not None and st["recency_days"] < 90:
                keep = bool(c.coupon_sent_date and last_order and last_order > c.coupon_sent_date)
                if keep:
                    log["C_kalan"] += 1
                    tag = "[Sistem] Geri kazanıldı: kupon sonrası sipariş verdi"
                    if tag not in (c.note or ""):
                        c.note = f"{(c.note + ' | ') if c.note else ''}{tag}"
                else:
                    _clear_campaign(c); log["C_silinen"] += 1

            # I) kupon var ama kampanya yok → türet
            if (c.coupon_sent or c.coupon_code) and not c.campaign_type:
                c.campaign_type = _derive_campaign(c.coupon_code, st, elig)
                if c.campaign_type:
                    log["I"] += 1
                else:
                    _clear_campaign(c); log["I_temiz"] += 1

            # D) kupon gönderildi ama kod yok
            if c.coupon_sent and not c.coupon_code:
                code = _code_for(c.campaign_type)
                if code:
                    c.coupon_code = code; log["D"] += 1
                else:
                    _clear_campaign(c)

            # E) kupon gönderildi ama gönderim tarihi yok
            if c.coupon_sent and not c.coupon_sent_date:
                c.coupon_sent_date = c.last_call_date or last_order or _WELCOME_START
                log["E"] += 1

            # G) arandı ama arama tarihi yok
            if c.called and not c.last_call_date:
                c.last_call_date = c.coupon_sent_date or last_order or _WELCOME_START
                log["G"] += 1

            # J) durum boş
            if not c.status:
                c.status = "Aktif" if (st["recency_days"] is not None and st["recency_days"] <= 90) else "Pasif"
                log["J"] += 1

            c.updated_at = datetime.now()

        db.commit()
        print("Normalizasyon tamam:", log)
    finally:
        db.close()


if __name__ == "__main__":
    main()
