"""ikas GraphQL veri kaynağı — İLERİDE doldurulacak iskelet.

Tasarım: Bu sınıf CsvDataSource ile aynı `DataSource` arayüzünü uygular ve
aynı `NormalizedData`yı döner. Böylece ikas'a geçiş, uygulamanın geri kalanında
hiçbir değişiklik gerektirmez — sadece kullanılan kaynağı değiştirmek yeterli.

Yapılacaklar:
- ikas OAuth (client_id / client_secret) ile access token alma
- GraphQL `listOrder` sorgusu ile siparişleri sayfalı çekme
- Gelen JSON'u NormalizedData'ya (customers/products/orders/order_items) çevirme
"""
from app.config import settings
from app.ingestion.base import DataSource, NormalizedData


class IkasDataSource(DataSource):
    def __init__(self) -> None:
        self.api_url = settings.ikas_api_url
        self.client_id = settings.ikas_client_id
        self.client_secret = settings.ikas_client_secret

    def load(self) -> NormalizedData:
        raise NotImplementedError(
            "ikas GraphQL kaynağı henüz uygulanmadı. Şimdilik CSV kaynağını kullanın."
        )
