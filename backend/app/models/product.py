"""Ürün tablosu — kalemlerden türetilir. SKU yoksa ad ile teklenir."""
from sqlalchemy import Float, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    # Doğal anahtar: SKU varsa SKU, yoksa ürün adı (ingestion'da belirlenir)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, index=True)
    brand: Mapped[str | None] = mapped_column(String)
    sku: Mapped[str | None] = mapped_column(String)
    barcode: Mapped[str | None] = mapped_column(String)
    sale_price: Mapped[float | None] = mapped_column(Float)
    purchase_price: Mapped[float | None] = mapped_column(Float)

    items: Mapped[list["OrderItem"]] = relationship(  # noqa: F821
        back_populates="product"
    )
