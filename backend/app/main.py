"""FastAPI uygulaması — giriş noktası."""
import base64
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import Response

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


@app.middleware("http")
async def basic_auth(request: Request, call_next):
    """app_password tanımlıysa /health hariç tüm isteklerde Basic Auth ister."""
    if settings.app_password and request.url.path != "/health":
        header = request.headers.get("Authorization", "")
        ok = False
        if header.startswith("Basic "):
            try:
                user, _, pwd = base64.b64decode(header[6:]).decode("utf-8").partition(":")
                ok = (secrets.compare_digest(user, settings.app_username)
                      and secrets.compare_digest(pwd, settings.app_password))
            except Exception:
                ok = False
        if not ok:
            return Response(
                "Kimlik doğrulama gerekli",
                status_code=401,
                headers={"WWW-Authenticate": 'Basic realm="mezzeMarin CRM"'},
            )
    return await call_next(request)


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
