"""NormalizedData'yı SQLite'a yazan kaynak-bağımsız yükleyici.

Yükleme tam-yenileme (truncate + insert) mantığıyla çalışır: her ingest'te
tablolar temizlenip baştan doldurulur. Lokal/küçük veri için en basit ve
güvenilir yöntem.
"""
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.database import Base, SessionLocal, engine
from app.ingestion.base import NormalizedData
from app.models import Customer, Order, OrderItem, Product


def load_into_db(data: NormalizedData, db: Session | None = None) -> dict:
    """Normalize veriyi DB'ye yazar. FK sırasına dikkat eder."""
    Base.metadata.create_all(bind=engine)
    own_session = db is None
    db = db or SessionLocal()
    try:
        # Mevcut veriyi temizle (FK sırası: önce çocuklar)
        db.execute(delete(OrderItem))
        db.execute(delete(Order))
        db.execute(delete(Product))
        db.execute(delete(Customer))
        db.flush()

        db.bulk_insert_mappings(Customer, data.customers)
        db.bulk_insert_mappings(Product, data.products)
        db.bulk_insert_mappings(Order, data.orders)
        db.bulk_insert_mappings(OrderItem, data.order_items)
        db.commit()

        return {
            "customers": len(data.customers),
            "products": len(data.products),
            "orders": len(data.orders),
            "order_items": len(data.order_items),
        }
    except Exception:
        db.rollback()
        raise
    finally:
        if own_session:
            db.close()
