"""Müşteri CRM/kampanya takip katmanı — kullanıcı tarafından girilen, kalıcı veri.

Sipariş verisinden AYRIDIR: CSV her yüklendiğinde silinmez. Kanonik müşteriye
(customers.id = birincil e-posta) bağlıdır. Yeniden çözümleme sonrası bağ
kopmasın diye e-posta da saklanır.
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CustomerCRM(Base):
    __tablename__ = "customer_crm"

    customer_id: Mapped[str] = mapped_column(String, primary_key=True)  # kanonik (birincil e-posta)
    email: Mapped[str | None] = mapped_column(String, index=True)       # yedek eşleştirme

    status: Mapped[str | None] = mapped_column(String)          # Aktif / Pasif / VIP ...
    campaign_type: Mapped[str | None] = mapped_column(String)   # Hoşgeldin / Sadakat / Nerdesin / 25K+%5

    to_call: Mapped[bool] = mapped_column(Boolean, default=False)        # aranacak mı?
    called: Mapped[bool] = mapped_column(Boolean, default=False)         # arandı mı?
    last_call_date: Mapped[datetime | None] = mapped_column(DateTime)
    call_outcome: Mapped[str | None] = mapped_column(String)             # çağrı sonucu (cevap)

    coupon_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    coupon_code: Mapped[str | None] = mapped_column(String)
    coupon_sent_date: Mapped[datetime | None] = mapped_column(DateTime)
    coupon_expiry_date: Mapped[datetime | None] = mapped_column(DateTime)
    coupon_used: Mapped[str | None] = mapped_column(String)              # kupon kullanıldı mı

    note: Mapped[str | None] = mapped_column(String)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime)
