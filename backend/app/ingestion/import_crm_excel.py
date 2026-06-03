"""Mevcut manuel CRM Excel'ini (CRM_Tek_Sayfa) panele aktarır.

E-postaları kanonik müşteriye (customers.emails) eşler, customer_crm tablosuna
upsert eder. Tek seferlik / tekrar çalıştırılabilir (idempotent — upsert).

Kullanım (backend/ klasöründen):
    python -m app.ingestion.import_crm_excel "../data/GÜNCEL CRM TABLOSU.xlsx"
"""
import sys
from datetime import datetime

import pandas as pd
from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.models import Customer, CustomerCRM

SHEET = "CRM_Tek_Sayfa"
HEADER_ROW = 2


def _col(df, *prefixes):
    """Başlığı verilen önek(ler)le başlayan ilk kolonu bulur (kısaltmalara dayanıklı)."""
    for c in df.columns:
        name = str(c).strip().lower()
        for p in prefixes:
            if name.startswith(p.lower()):
                return c
    return None


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


def _yes(v):
    return _s(v) is not None and str(v).strip().lower() in ("evet", "e", "yes", "true", "1")


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "../data/GÜNCEL CRM TABLOSU.xlsx"
    Base.metadata.create_all(bind=engine)
    df = pd.read_excel(path, sheet_name=SHEET, header=HEADER_ROW)
    df = df[df[_col(df, "Ad Soyad")].notna()]

    c_email = _col(df, "E-posta", "Eposta", "Mail")
    c_status = _col(df, "Durum")
    c_camp = _col(df, "CRM Türü", "Kampanya")
    c_tocall = _col(df, "Aranacak")
    c_called = _col(df, "Arandı")
    c_calldate = _col(df, "Son Arama")
    c_couponsent = _col(df, "Kupon Gönderildi")
    c_couponcode = _col(df, "Kupon Kodu")
    c_couponsentdate = _col(df, "Kupon Gönderim")
    c_couponexp = _col(df, "Kupon Bitiş")
    c_note = _col(df, "Not")

    db = SessionLocal()
    try:
        # Kanonik e-posta -> customer_id haritası
        email2canon: dict[str, str] = {}
        for c in db.execute(select(Customer)).scalars():
            for e in (c.emails or c.id).split(","):
                e = e.strip().lower()
                if e:
                    email2canon[e] = c.id

        def set_str(crm, attr, val):  # boş değer mevcut doluyu ezmesin
            if val is not None and getattr(crm, attr) in (None, ""):
                setattr(crm, attr, val)

        def set_bool(crm, attr, val):  # birden çok satırda True varsa True kalsın
            setattr(crm, attr, bool(getattr(crm, attr)) or bool(val))

        seen: dict[str, CustomerCRM] = {}
        matched = unmatched = merged = 0
        unmatched_emails = []
        for _, r in df.iterrows():
            email = _s(r[c_email])
            if not email:
                continue
            canon = email2canon.get(email.strip().lower())
            if not canon:
                unmatched += 1
                unmatched_emails.append(email)
                continue
            matched += 1
            crm = seen.get(canon) or db.get(CustomerCRM, canon)
            if crm is None:
                crm = CustomerCRM(customer_id=canon, email=email.lower())
                db.add(crm)
            elif canon in seen:
                merged += 1  # aynı kanonik müşteriye ikinci Excel satırı
            seen[canon] = crm

            set_str(crm, "status", _s(r[c_status]) if c_status else None)
            set_str(crm, "campaign_type", _s(r[c_camp]) if c_camp else None)
            tocall_val = (_s(r[c_tocall]) if c_tocall else None) or ""
            set_bool(crm, "to_call", tocall_val.lower() == "aranacak")
            set_bool(crm, "called",
                     (_yes(r[c_called]) if c_called else False) or tocall_val.lower() == "arandı")
            set_str(crm, "last_call_date", _dt(r[c_calldate]) if c_calldate else None)
            set_bool(crm, "coupon_sent", _yes(r[c_couponsent]) if c_couponsent else False)
            set_str(crm, "coupon_code", _s(r[c_couponcode]) if c_couponcode else None)
            set_str(crm, "coupon_sent_date", _dt(r[c_couponsentdate]) if c_couponsentdate else None)
            set_str(crm, "coupon_expiry_date", _dt(r[c_couponexp]) if c_couponexp else None)
            set_str(crm, "note", _s(r[c_note]) if c_note else None)
            crm.updated_at = datetime.now()
            db.flush()
        db.commit()
        print(f"Eşleşen satır: {matched} ({len(seen)} tekil müşteri, {merged} mükerrer birleşti), eşleşmeyen: {unmatched}")
        if unmatched_emails:
            print("Eşleşmeyen e-postalar:", unmatched_emails[:20])
    finally:
        db.close()


if __name__ == "__main__":
    main()
