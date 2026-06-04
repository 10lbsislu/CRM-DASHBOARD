"""Aya özel lojistik/kargo ayarları (kullanıcı tarafından düzenlenir).

Her ay için: bizim gönderi başına kargo maliyetimiz + müşteriden alınan
kademeli (bracket) kargo bedeli kuralı.

Müşteriden alınan kargo kuralı (örn. Mayıs 2026):
  total >= free_threshold (20000)        -> 0 (ücretsiz)
  total <  low_threshold  (5000)         -> low_fee (1500)
  arada (5000–20000)                     -> mid_fee (800)
"""
from datetime import datetime

from sqlalchemy import DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LogisticsConfig(Base):
    __tablename__ = "logistics_config"

    month: Mapped[str] = mapped_column(String, primary_key=True)  # "YYYY-MM"
    shipping_cost: Mapped[float] = mapped_column(Float)           # bizim gönderi maliyeti
    low_threshold: Mapped[float | None] = mapped_column(Float)    # altı low_fee
    low_fee: Mapped[float | None] = mapped_column(Float)
    mid_fee: Mapped[float | None] = mapped_column(Float)          # low–free arası
    free_threshold: Mapped[float | None] = mapped_column(Float)   # üstü ücretsiz
    updated_at: Mapped[datetime | None] = mapped_column(DateTime)
