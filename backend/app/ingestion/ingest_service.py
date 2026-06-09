"""Biriktiren (upsert) veri yükleme — günlük yüklemeler için.

Sipariş no bazlı upsert: gelen siparişler eklenir/güncellenir, mevcut geçmiş
korunur. Yüklemeden sonra kimlik çözümleme tüm veri üzerinde yeniden çalışır.
"""
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import Base, engine
from app.ingestion.base import NormalizedData
from app.ingestion.identity import reresolve_db
from app.models import Order, OrderItem, Product


def upsert(data: NormalizedData, db: Session) -> dict:
    """NormalizedData'yı DB'ye biriktirerek yazar ve kimlikleri yeniden çözer."""
    Base.metadata.create_all(bind=engine)

    incoming = {o["order_number"] for o in data.orders}
    existing = set(
        db.scalars(
            select(Order.order_number).where(Order.order_number.in_(incoming))
        ).all()
    )
    new_orders = incoming - existing

    # Gelen siparişlerin eski hâlini (ve kalemlerini) sil, tazesini ekle
    if incoming:
        db.execute(delete(OrderItem).where(OrderItem.order_number.in_(incoming)))
        db.execute(delete(Order).where(Order.order_number.in_(incoming)))
        db.flush()

    # Sipariş kaydını yazarken kimlik çözümleme sonradan customer_id atayacak
    orders_to_insert = [{k: v for k, v in o.items() if k != "customer_id"} for o in data.orders]
    db.bulk_insert_mappings(Order, orders_to_insert)
    db.bulk_insert_mappings(OrderItem, data.order_items)

    # Ürünleri upsert et (yeni id varsa ekle, varsa fiyatları güncelle)
    new_products = 0
    for p in data.products:
        obj = db.get(Product, p["id"])
        if obj is None:
            db.add(Product(**p))
            new_products += 1
        else:
            obj.name = p.get("name") or obj.name
            obj.brand = p.get("brand") or obj.brand
            obj.sku = p.get("sku") or obj.sku
            obj.barcode = p.get("barcode") or obj.barcode
            if p.get("sale_price") is not None:
                obj.sale_price = p["sale_price"]
            if p.get("purchase_price") is not None:
                obj.purchase_price = p["purchase_price"]
    db.flush()

    # Tüm veri üzerinde kimlik çözümleme (yeni müşteri eski biriyle birleşebilir)
    total_customers = reresolve_db(db)

    # Yeni eklenen siparişlerin detayı (kaçıncı sipariş + kampanya/indirim)
    from app.services import orders_service
    new_details = [
        r for r in orders_service.list_orders(db) if r["order_number"] in new_orders
    ]

    order_total = db.query(Order).count()
    return {
        "uploaded_orders": len(incoming),
        "new_orders": len(new_orders),
        "updated_orders": len(existing),
        "new_products": new_products,
        "total_orders_in_db": order_total,
        "total_customers_in_db": total_customers,
        "new_order_details": new_details,
    }
