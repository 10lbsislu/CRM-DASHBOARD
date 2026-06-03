"""E-ticaret arama listesini (PINAR) CRM'e aktarır.

Bu dosya müşteriyi E-POSTA ile değil, AD + TELEFON ile tutuyor. Bu yüzden
eşleştirme telefon (öncelik) ve ada göre kanonik müşteriye yapılır.
Aktarılan: arandı=True, son arama tarihi, %5 kupon bilgisi, çağrı notu.

Kullanım (backend/ klasöründen):
    python -m app.ingestion.import_call_list "../data/E TİCARET ARAMASI LİSTESİ PINAR.xlsx"
"""
import sys
from collections import defaultdict
from datetime import datetime

import pandas as pd
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.ingestion.identity import _norm_name, _norm_phone
from app.models import Customer, CustomerCRM, Order

# (sayfa adı, başlık satırı, veri başlangıç satırı)
SHEETS = [("%5 kupon", 1, 2), ("Sayfa1", None, 0)]
# Konuma göre kolonlar: 0=arama tarihi, 2=ad, 3=telefon, 4=indirim bilgisi, 5=not
C_DATE, C_NAME, C_PHONE, C_INFO, C_NOTE = 0, 2, 3, 4, 5


def _s(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s or None


def _dt(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    d = pd.to_datetime(v, errors="coerce", dayfirst=True)
    return None if pd.isna(d) else d.to_pydatetime()


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "../data/E TİCARET ARAMASI LİSTESİ PINAR.xlsx"
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Telefon -> kanonik (siparişlerin ham telefonundan) ve ad -> kanonik
        phone2canon: dict[str, str] = {}
        for cid, ph in db.execute(
            select(Order.customer_id, Order.customer_phone).where(Order.customer_id.isnot(None))
        ):
            n = _norm_phone(ph)
            if n:
                phone2canon.setdefault(n, cid)
        name2ids: dict[str, set] = defaultdict(set)
        for c in db.execute(select(Customer)).scalars():
            n = _norm_phone(c.phone)
            if n:
                phone2canon.setdefault(n, c.id)
            nm = _norm_name(c.full_name)
            if nm:
                name2ids[nm].add(c.id)

        matched = unmatched = 0
        unmatched_rows = []
        for sheet, header, start in SHEETS:
            raw = pd.read_excel(path, sheet_name=sheet, header=None)
            for i in range(start, len(raw)):
                row = raw.iloc[i]
                name = _s(row[C_NAME])
                phone = _s(row[C_PHONE]) if len(row) > C_PHONE else None
                if not name and not phone:
                    continue
                canon = None
                np = _norm_phone(phone)
                if np and np in phone2canon:
                    canon = phone2canon[np]
                if not canon:  # ada göre (tekse)
                    nm = _norm_name(name)
                    ids = name2ids.get(nm) if nm else None
                    if ids and len(ids) == 1:
                        canon = next(iter(ids))
                if not canon:
                    unmatched += 1
                    unmatched_rows.append(name or phone)
                    continue
                matched += 1

                crm = db.get(CustomerCRM, canon)
                if crm is None:
                    crm = CustomerCRM(customer_id=canon)
                    db.add(crm)
                # Arandı + son arama tarihi
                crm.called = True
                call_dt = _dt(row[C_DATE])
                if call_dt and (crm.last_call_date is None or call_dt > crm.last_call_date):
                    crm.last_call_date = call_dt
                # %5 kupon bilgisi
                info = _s(row[C_INFO]) if len(row) > C_INFO else None
                if info and ("%5" in info or "5" in info or "25.000" in info.replace(".", "")):
                    crm.coupon_sent = True
                    if not crm.campaign_type:
                        crm.campaign_type = "25.000TL ve Üstüne %5"
                    if not crm.coupon_code:
                        crm.coupon_code = "SEPETTE %5"
                # Çağrı notu ekle
                note = _s(row[C_NOTE]) if len(row) > C_NOTE else None
                if note:
                    prefix = (crm.note + " | ") if crm.note else ""
                    if note not in (crm.note or ""):
                        crm.note = f"{prefix}[Arama] {note}"
                crm.updated_at = datetime.now()
                db.flush()
        db.commit()
        print(f"Eşleşen: {matched}, eşleşmeyen: {unmatched}")
        if unmatched_rows:
            print("Eşleşmeyenler (ilk 25):", unmatched_rows[:25])
    finally:
        db.close()


if __name__ == "__main__":
    main()
