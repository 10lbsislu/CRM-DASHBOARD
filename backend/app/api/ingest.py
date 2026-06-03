"""CSV yükleme endpoint'i — günlük export'ları biriktirerek yükler."""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.ingestion.base import NormalizedData
from app.ingestion.csv_source import CsvDataSource
from app.ingestion.ingest_service import upsert

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


@router.post("/upload")
async def upload(files: list[UploadFile], db: Session = Depends(get_db)):
    """Bir veya birden çok CSV yükler, ham dosyayı arşivler ve veriyi biriktirir."""
    uploads_dir = settings.data_path / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # Tüm dosyaları tek partide birleştir, sonra tek upsert + tek kimlik çözümleme
    combined = NormalizedData()
    saved = []
    for f in files:
        if not f.filename or not f.filename.lower().endswith(".csv"):
            raise HTTPException(400, f"Yalnızca CSV kabul edilir: {f.filename}")
        content = await f.read()
        dest = uploads_dir / f"{stamp}__{f.filename}"
        dest.write_bytes(content)
        saved.append(dest.name)

        data = CsvDataSource(dest).load()
        combined.orders.extend(data.orders)
        combined.order_items.extend(data.order_items)
        combined.products.extend(data.products)

    if not combined.orders:
        raise HTTPException(400, "Yüklenen dosyalarda sipariş bulunamadı.")

    result = upsert(combined, db)
    result["saved_files"] = saved
    return result
