"""Tüm modelleri içe aktarır — Base.metadata bütün tabloları görsün diye."""
from app.models.customer import Customer
from app.models.customer_crm import CustomerCRM
from app.models.order import Order, OrderItem
from app.models.product import Product

__all__ = ["Customer", "Product", "Order", "OrderItem", "CustomerCRM"]
