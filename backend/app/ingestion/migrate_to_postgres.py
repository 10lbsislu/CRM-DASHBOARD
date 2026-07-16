"""Yerel SQLite (crm.db) → hedef PostgreSQL'e TAM veri kopyalama (Render restore).

Tüm tabloları (siparişler, müşteriler, ürünler, kalemler, customer_crm,
logistics_config) olduğu gibi kopyalar. Hedef Postgres'te 'mezzemarin' şemasına yazar.

Kullanım (backend/ klasöründen):
    # Önce sadece kaynak sayımlarını gör (güvenli):
    python -m app.ingestion.migrate_to_postgres --dry

    # Gerçek kopyalama (Render Postgres EXTERNAL Database URL ile):
    python -m app.ingestion.migrate_to_postgres "postgresql://user:pass@host/db"

Not: Hedef tablolar önce temizlenir (tekrar çalıştırılabilir).
"""
import sys

from sqlalchemy import create_engine, delete, event, func, insert, select


def main():
    target_url = None if (len(sys.argv) < 2 or sys.argv[1] == "--dry") else sys.argv[1]

    from app.database import Base, engine as src_engine
    from app import models  # noqa: F401  (tabloları Base.metadata'ya kaydeder)

    # Kaynak (yerel SQLite) sayımları
    with src_engine.connect() as s:
        print("=== Yerel kaynak veri (crm.db) ===")
        for t in Base.metadata.sorted_tables:
            n = s.execute(select(func.count()).select_from(t)).scalar()
            print(f"  {t.name}: {n}")

    if not target_url:
        print("\n(dry-run) Hedef URL verilmedi — kopyalama yapılmadı.")
        return

    if target_url.startswith("postgres://"):
        target_url = target_url.replace("postgres://", "postgresql://", 1)

    tgt = create_engine(target_url)

    @event.listens_for(tgt, "connect")
    def _schema(dbapi_conn, _record):
        ac = dbapi_conn.autocommit
        dbapi_conn.autocommit = True
        with dbapi_conn.cursor() as cur:
            cur.execute("CREATE SCHEMA IF NOT EXISTS mezzemarin")
            cur.execute("SET search_path TO mezzemarin, public")
        dbapi_conn.autocommit = ac

    # Şemayı tazele (yeni kolonlar da gelsin) — sadece uygulamanın kendi tabloları
    Base.metadata.drop_all(tgt)
    Base.metadata.create_all(tgt)
    print("\n=== Kopyalanıyor → PostgreSQL (mezzemarin şeması, şema yenilendi) ===")
    with src_engine.connect() as s, tgt.begin() as t:
        for table in reversed(Base.metadata.sorted_tables):
            t.execute(delete(table))
        total = 0
        for table in Base.metadata.sorted_tables:
            rows = [dict(r._mapping) for r in s.execute(select(table))]
            if rows:
                t.execute(insert(table), rows)
            total += len(rows)
            print(f"  {table.name}: {len(rows)}")
    print(f"\n✓ TAMAM — {total} satır Postgres'e kopyalandı.")


if __name__ == "__main__":
    main()
