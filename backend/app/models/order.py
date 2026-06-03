"""Sipariş ve sipariş kalemi tabloları."""
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Order(Base):
    __tablename__ = "orders"

    order_number: Mapped[str] = mapped_column(String, primary_key=True)

    # Kanonik müşteri (kimlik çözümleme sonrası) — FK
    customer_id: Mapped[str | None] = mapped_column(
        ForeignKey("customers.id"), index=True
    )
    # Siparişteki ham müşteri bilgisi (kimlik çözümleme DB'den tekrar yapılabilsin)
    customer_email: Mapped[str | None] = mapped_column(String, index=True)
    customer_name: Mapped[str | None] = mapped_column(String)
    customer_phone: Mapped[str | None] = mapped_column(String)

    # Tarihler
    order_date: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    created_date: Mapped[datetime | None] = mapped_column(DateTime)
    cancelled_date: Mapped[datetime | None] = mapped_column(DateTime)

    # Durum
    status: Mapped[str | None] = mapped_column(String, index=True)
    payment_status: Mapped[str | None] = mapped_column(String)

    # Tutarlar
    currency: Mapped[str | None] = mapped_column(String)
    subtotal: Mapped[float | None] = mapped_column(Float)
    shipping_price: Mapped[float | None] = mapped_column(Float)
    taxes: Mapped[float | None] = mapped_column(Float)
    total: Mapped[float | None] = mapped_column(Float)
    campaign_total: Mapped[float | None] = mapped_column(Float)
    refund_amount: Mapped[float | None] = mapped_column(Float)

    # Lojistik / kanal
    shipping_method: Mapped[str | None] = mapped_column(String)
    city: Mapped[str | None] = mapped_column(String, index=True)
    district: Mapped[str | None] = mapped_column(String)
    country: Mapped[str | None] = mapped_column(String)
    sales_channel: Mapped[str | None] = mapped_column(String)
    payment_method: Mapped[str | None] = mapped_column(String)
    coupon_code: Mapped[str | None] = mapped_column(String)

    customer: Mapped["Customer | None"] = relationship(  # noqa: F821
        back_populates="orders"
    )
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_number: Mapped[str] = mapped_column(
        ForeignKey("orders.order_number"), index=True
    )
    product_id: Mapped[str | None] = mapped_column(
        ForeignKey("products.id"), index=True
    )

    product_name: Mapped[str | None] = mapped_column(String)
    brand: Mapped[str | None] = mapped_column(String)
    quantity: Mapped[int | None] = mapped_column(Integer)
    unit_price: Mapped[float | None] = mapped_column(Float)
    discount_price: Mapped[float | None] = mapped_column(Float)
    sku: Mapped[str | None] = mapped_column(String)

    order: Mapped["Order"] = relationship(back_populates="items")
    product: Mapped["Product | None"] = relationship(  # noqa: F821
        back_populates="items"
    )
