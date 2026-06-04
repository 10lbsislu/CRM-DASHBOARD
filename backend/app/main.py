"""FastAPI uygulaması — giriş noktası."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import BACKEND_DIR, settings
from app.database import Base, engine
from app import models  # noqa: F401  (modelleri Base.metadata'ya kaydeder)
from app.api import basket, crm, customers, ingest, logistics, orders, stats


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Uygulama açılışında tabloları oluştur (yoksa)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="ikas CRM Dashboard API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


# 4 panel bölümünün router'ları
app.include_router(orders.router)
app.include_router(stats.router)
app.include_router(customers.router)
app.include_router(basket.router)
app.include_router(ingest.router)
app.include_router(crm.router)
app.include_router(logistics.router)

# Build edilmiş frontend'i servis et (varsa) — tek port üzerinden dağıtım.
# API rotalarından SONRA mount edilir ki /api/* öncelikli kalsın.
_frontend_dist = BACKEND_DIR.parent / "frontend" / "dist"
if _frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
