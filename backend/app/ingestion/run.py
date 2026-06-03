"""Veri yükleme çalıştırıcısı.

Kullanım (backend/ klasöründen, venv aktifken):
    python -m app.ingestion.run                 # data/ içindeki CSV'leri otomatik bul
    python -m app.ingestion.run --csv yol.csv   # belirli bir CSV
    python -m app.ingestion.run --source ikas   # (ileride) ikas GraphQL

CSV otomatik bulma: DATA_DIR içindeki tüm *.csv dosyaları okunup birleştirilir.
"""
import argparse
import sys

from app.config import settings
from app.ingestion.base import DataSource, NormalizedData
from app.ingestion.csv_source import CsvDataSource
from app.ingestion.identity import resolve
from app.ingestion.loader import load_into_db


def _discover_csv_sources() -> list[DataSource]:
    data_dir = settings.data_path
    csv_files = sorted(data_dir.glob("*.csv"))
    if not csv_files:
        print(f"HATA: {data_dir} içinde CSV bulunamadı.", file=sys.stderr)
        sys.exit(1)
    print(f"{len(csv_files)} CSV bulundu: {[f.name for f in csv_files]}")
    return [CsvDataSource(f) for f in csv_files]


def _merge(results: list[NormalizedData]) -> NormalizedData:
    merged = NormalizedData()
    seen_products: set = set()
    seen_customers: set = set()
    for r in results:
        merged.orders.extend(r.orders)
        merged.order_items.extend(r.order_items)
        for p in r.products:
            if p["id"] not in seen_products:
                seen_products.add(p["id"])
                merged.products.append(p)
        for c in r.customers:
            if c["email"] not in seen_customers:
                seen_customers.add(c["email"])
                merged.customers.append(c)
    return merged


def main() -> None:
    parser = argparse.ArgumentParser(description="CRM veri yükleyici")
    parser.add_argument("--csv", help="Belirli bir CSV dosyası yolu")
    parser.add_argument(
        "--source", default="csv", choices=["csv", "ikas"], help="Veri kaynağı"
    )
    parser.add_argument(
        "--replace", action="store_true",
        help="Tüm veriyi sıfırlayıp baştan yükle (varsayılan: biriktir/upsert)",
    )
    args = parser.parse_args()

    if args.source == "ikas":
        from app.ingestion.ikas_source import IkasDataSource

        sources: list[DataSource] = [IkasDataSource()]
    elif args.csv:
        sources = [CsvDataSource(args.csv)]
    else:
        sources = _discover_csv_sources()

    results = [s.load() for s in sources]
    data = _merge(results) if len(results) > 1 else results[0]
    print("Okunan veri:", data.summary())

    if args.replace:
        # Tam sıfırlama: müşterileri çöz ve truncate+insert
        data = resolve(data)
        counts = load_into_db(data)
        print("DB sıfırlandı ve yazıldı:", counts)
    else:
        # Biriktir (upsert) + DB-geneli kimlik çözümleme
        from app.database import SessionLocal
        from app.ingestion.ingest_service import upsert

        db = SessionLocal()
        try:
            counts = upsert(data, db)
        finally:
            db.close()
        print("Biriktirildi:", counts)


if __name__ == "__main__":
    main()
