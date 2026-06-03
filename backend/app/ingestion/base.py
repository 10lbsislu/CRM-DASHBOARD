"""Veri kaynağı soyutlaması.

Her veri kaynağı (CSV, ileride ikas GraphQL) bu arayüzü uygular ve
kaynak-bağımsız `NormalizedData` üretir. Uygulamanın geri kalanı verinin
nereden geldiğini bilmez — sadece bu sözleşmeyi kullanır.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class NormalizedData:
    """DB tablolarına birebir karşılık gelen, kaynaktan bağımsız veri."""

    customers: list[dict] = field(default_factory=list)
    products: list[dict] = field(default_factory=list)
    orders: list[dict] = field(default_factory=list)
    order_items: list[dict] = field(default_factory=list)

    def summary(self) -> str:
        return (
            f"{len(self.customers)} müşteri, {len(self.products)} ürün, "
            f"{len(self.orders)} sipariş, {len(self.order_items)} kalem"
        )


class DataSource(ABC):
    """Tüm veri kaynaklarının uygulayacağı arayüz."""

    @abstractmethod
    def load(self) -> NormalizedData:
        """Kaynaktan veriyi okuyup normalize edilmiş hâlde döner."""
        raise NotImplementedError
