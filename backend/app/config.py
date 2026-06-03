"""Uygulama ayarları — .env dosyasından okunur."""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ klasörünün kök yolu (config.py -> app -> backend)
BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # Veritabanı
    database_url: str = "sqlite:///./crm.db"

    # CSV verilerinin klasörü (backend/ klasörüne göre)
    data_dir: str = "../data"

    # API sunucu
    api_host: str = "127.0.0.1"
    api_port: int = 8000

    # CORS — frontend adresi
    frontend_origin: str = "http://localhost:5173"

    # ikas GraphQL (ileride)
    ikas_api_url: str = ""
    ikas_client_id: str = ""
    ikas_client_secret: str = ""

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def data_path(self) -> Path:
        """CSV klasörünün mutlak yolu."""
        p = Path(self.data_dir)
        return p if p.is_absolute() else (BACKEND_DIR / p).resolve()


settings = Settings()
