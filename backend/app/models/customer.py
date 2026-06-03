"""Müşteri tablosu — kimlik çözümleme ile birleştirilmiş kanonik müşteri.

`id` kanonik müşteri kimliğidir (grubun birincil e-postası). Aynı kişiye ait
birden çok e-posta `emails` alanında virgülle saklanır.
"""
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    primary_email: Mapped[str | None] = mapped_column(String)
    emails: Mapped[str | None] = mapped_column(String)  # gruptaki tüm e-postalar
    full_name: Mapped[str | None] = mapped_column(String)
    phone: Mapped[str | None] = mapped_column(String)
    city: Mapped[str | None] = mapped_column(String)
    district: Mapped[str | None] = mapped_column(String)

    orders: Mapped[list["Order"]] = relationship(  # noqa: F821
        back_populates="customer"
    )
