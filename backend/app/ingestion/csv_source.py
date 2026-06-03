"""ikas sipariş CSV export'unu okuyup normalize eden veri kaynağı.

ikas export'unda her satır bir sipariş KALEMİdir. Sipariş düzeyindeki alanlar
(toplam, adres, ödeme durumu vb.) yalnızca siparişin ilk kalem satırında dolu,
sonraki satırlarda boştur. Burada sipariş no'ya göre gruplayıp her grup için
ilk dolu değeri alarak sipariş başlığını, her satırı da bir kalem olarak çıkarırız.
"""
from pathlib import Path

import pandas as pd

from app.ingestion.base import DataSource, NormalizedData

# ikas CSV kolon adı -> iç alan adı eşlemesi
COL = {
    "order_number": "Sipariş Numarası",
    "full_name": "Müşteri Tam Adı",
    "first_name": "Müşteri Adı",
    "last_name": "Müşteri Soyadı",
    "email": "E-posta",
    "payment_status": "Sipariş Ödeme Durumu",
    "order_date": "Sipariş Tarihi",
    "status": "Sipariş Durumu",
    "currency": "Kur",
    "subtotal": "Ara Toplam",
    "shipping_price": "Kargo Fiyatı",
    "shipping_method": "Kargo Yöntemi",
    "taxes": "Vergiler",
    "total": "Toplam",
    "campaign_total": "Kampanya Toplamı",
    "created_date": "Oluşturulma Tarihi",
    "cancelled_date": "İptal Tarihi",
    "refund_amount": "İade Tutarı",
    "payment_method": "Ödeme Yöntemi",
    "coupon_code": "Kupon Kodu",
    "sales_channel": "Satış Kanalı",
    "city": "Fatura Adresi Şehir",
    "district": "Fatura Adresi İlçe",
    "country": "Fatura Adresi Ülke",
    "phone": "Fatura Adresi Telefon Numarası",
    # Kalem (ürün) alanları
    "product_name": "Ürün Adı",
    "product_brand": "Ürün Marka",
    "product_qty": "Ürün Sayısı",
    "product_sale_price": "Ürün Satış Fiyatı",
    "product_discount_price": "Ürün İndirim Fiyatı",
    "product_purchase_price": "Ürün Alış Fiyatı",
    "product_sku": "Ürün SKU",
    "product_barcode": "Ürün Barkod",
}

# Sipariş başlığını oluşturan (grup içinde ilk dolu değeri alınacak) alanlar
ORDER_LEVEL = [
    "email", "full_name", "first_name", "last_name", "payment_status",
    "order_date", "status", "currency", "subtotal", "shipping_price",
    "shipping_method", "taxes", "total", "campaign_total", "created_date",
    "cancelled_date", "refund_amount", "payment_method", "coupon_code",
    "sales_channel", "city", "district", "country", "phone",
]

NUMERIC = [
    "subtotal", "shipping_price", "taxes", "total", "campaign_total",
    "refund_amount", "product_sale_price", "product_discount_price",
    "product_purchase_price",
]
DATES = ["order_date", "created_date", "cancelled_date"]


def _clean_str(v) -> str | None:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s or None


def _num(v) -> float | None:
    n = pd.to_numeric(v, errors="coerce")
    return None if pd.isna(n) else float(n)


def _dt(v):
    d = pd.to_datetime(v, errors="coerce")
    return None if pd.isna(d) else d.to_pydatetime()


def _product_id(sku: str | None, name: str | None) -> str | None:
    """Doğal anahtar: SKU varsa SKU, yoksa ürün adı."""
    return sku or name


class CsvDataSource(DataSource):
    def __init__(self, csv_path: str | Path):
        self.csv_path = Path(csv_path)

    def load(self) -> NormalizedData:
        if not self.csv_path.exists():
            raise FileNotFoundError(f"CSV bulunamadı: {self.csv_path}")

        raw = pd.read_csv(self.csv_path, dtype=str, encoding="utf-8-sig")

        # İlgilendiğimiz kolonları iç adlara çevir (eksik kolonları None bırak)
        df = pd.DataFrame()
        for internal, src in COL.items():
            df[internal] = raw[src] if src in raw.columns else None

        df["order_number"] = df["order_number"].map(_clean_str)
        df = df.dropna(subset=["order_number"])

        for c in NUMERIC:
            df[c] = df[c].map(_num)
        for c in DATES:
            df[c] = df[c].map(_dt)

        data = NormalizedData()
        self._build_orders(df, data)
        self._build_items(df, data)
        self._build_products(df, data)
        self._build_customers(df, data)
        return data

    # --- Siparişler: grup başına ilk dolu değer ---
    def _build_orders(self, df: pd.DataFrame, data: NormalizedData) -> None:
        def first_valid(s: pd.Series):
            nn = s.dropna()
            return nn.iloc[0] if len(nn) else None

        grouped = df.groupby("order_number", sort=False)
        for order_no, g in grouped:
            row = {f: first_valid(g[f]) for f in ORDER_LEVEL}
            data.orders.append({
                "order_number": order_no,
                "customer_email": _clean_str(row["email"]),
                "customer_name": _clean_str(row["full_name"]),
                "customer_phone": _clean_str(row["phone"]),
                "order_date": row["order_date"],
                "created_date": row["created_date"],
                "cancelled_date": row["cancelled_date"],
                "status": _clean_str(row["status"]),
                "payment_status": _clean_str(row["payment_status"]),
                "currency": _clean_str(row["currency"]),
                "subtotal": row["subtotal"],
                "shipping_price": row["shipping_price"],
                "taxes": row["taxes"],
                "total": row["total"],
                "campaign_total": row["campaign_total"],
                "refund_amount": row["refund_amount"],
                "shipping_method": _clean_str(row["shipping_method"]),
                "city": _clean_str(row["city"]),
                "district": _clean_str(row["district"]),
                "country": _clean_str(row["country"]),
                "sales_channel": _clean_str(row["sales_channel"]),
                "payment_method": _clean_str(row["payment_method"]),
                "coupon_code": _clean_str(row["coupon_code"]),
            })

    # --- Kalemler: ürün adı olan her satır bir kalem ---
    def _build_items(self, df: pd.DataFrame, data: NormalizedData) -> None:
        for _, r in df.iterrows():
            name = _clean_str(r["product_name"])
            if not name:
                continue
            sku = _clean_str(r["product_sku"])
            qty = _num(r["product_qty"])
            data.order_items.append({
                "order_number": _clean_str(r["order_number"]),
                "product_id": _product_id(sku, name),
                "product_name": name,
                "brand": _clean_str(r["product_brand"]),
                "quantity": int(qty) if qty is not None else None,
                "unit_price": r["product_sale_price"],
                "discount_price": r["product_discount_price"],
                "sku": sku,
            })

    # --- Ürünler: kalemlerden teklenmiş ---
    def _build_products(self, df: pd.DataFrame, data: NormalizedData) -> None:
        seen: dict[str, dict] = {}
        for _, r in df.iterrows():
            name = _clean_str(r["product_name"])
            if not name:
                continue
            sku = _clean_str(r["product_sku"])
            pid = _product_id(sku, name)
            if pid in seen:
                continue
            seen[pid] = {
                "id": pid,
                "name": name,
                "brand": _clean_str(r["product_brand"]),
                "sku": sku,
                "barcode": _clean_str(r["product_barcode"]),
                "sale_price": r["product_sale_price"],
                "purchase_price": r["product_purchase_price"],
            }
        data.products = list(seen.values())

    # --- Müşteriler: e-postaya göre teklenmiş, en güncel sipariş bilgisiyle ---
    def _build_customers(self, df: pd.DataFrame, data: NormalizedData) -> None:
        with_email = df[df["email"].map(_clean_str).notna()].copy()
        if with_email.empty:
            return
        with_email["_od"] = with_email["order_date"]
        # En güncel siparişe ait satır en sona gelsin, son kalan kazansın
        with_email = with_email.sort_values("_od", na_position="first")
        seen: dict[str, dict] = {}
        for _, r in with_email.iterrows():
            email = _clean_str(r["email"])
            seen[email] = {
                "email": email,
                "full_name": _clean_str(r["full_name"]),
                "first_name": _clean_str(r["first_name"]),
                "last_name": _clean_str(r["last_name"]),
                "phone": _clean_str(r["phone"]),
                "city": _clean_str(r["city"]),
                "district": _clean_str(r["district"]),
            }
        data.customers = list(seen.values())
