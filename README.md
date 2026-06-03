# ikas CRM Dashboard

Bir e-ticaret mağazasının sipariş, müşteri ve ürün verilerini lokal bir web panelinde gösteren CRM dashboard'u.

## Paneldeki 4 Bölüm
1. **Yeni siparişler ve sipariş trendi**
2. **Sipariş istatistikleri** — ciro, ortalama sepet, en çok satanlar, şehir/trafik kırılımı
3. **Müşteri alışkanlıkları** — RFM segmentasyonu, en değerli müşteriler, churn riski
4. **Birlikte alınan ürünler** — market-basket analizi

## Stack
- **Backend:** Python + FastAPI
- **Veritabanı:** SQLite (başlangıç)
- **Frontend:** React + Vite + Recharts
- **Veri kaynağı:** CSV export (başlangıç) → ileride ikas GraphQL API

## Mimari Özet
```
CSV / (ileride) ikas GraphQL
        │  ingestion katmanı (DataSource arayüzü)
        ▼
     SQLite  ──►  analytics (RFM, market-basket)
        │              │
        ▼              ▼
   services  ──►  FastAPI (api/)  ──►  React + Recharts
```
Veri kaynağı `backend/app/ingestion/` altında soyutlandı: bugün CSV, yarın ikas GraphQL —
uygulamanın geri kalanı değişmeden kaynak eklenebilir.

## Klasör Yapısı
- `backend/` — FastAPI uygulaması, DB modelleri, analiz ve veri yükleme
- `frontend/` — Vite + React paneli
- `data/` — CSV export dosyaları (repoya girmez)
- `.env` — yerel ayarlar (`.env.example`'dan kopyalanır)

## Kurulum ve Çalıştırma

### 1) Ayarlar ve veri
```powershell
Copy-Item .env.example .env          # ayarları kopyala
# CSV export dosyalarını data/ içine koy (örn. data/ikas-siparisler.csv)
```

### 2) Backend (FastAPI)
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m app.ingestion.run            # CSV -> SQLite
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
# API:    http://127.0.0.1:8000
# Swagger: http://127.0.0.1:8000/docs
```

### 3) Frontend (Vite + React)
```powershell
cd frontend
npm install
npm run dev
# Panel: http://localhost:5173  (/api istekleri otomatik backend'e proxy'lenir)
```

## Ağda (LAN) Dağıtım
Frontend build edilip backend tarafından tek port (8000) üzerinden servis edilir.

1. **Frontend'i build et** (kod/veri değişince tekrar):
   ```powershell
   cd frontend
   npm run build
   ```
2. **Güvenlik duvarına izin ver** (bir kez, YÖNETİCİ PowerShell):
   ```powershell
   New-NetFirewallRule -DisplayName "mezzeMarin CRM 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private
   ```
3. **Sunucuyu başlat** (proje kökünde):
   ```powershell
   .\start-server.ps1
   ```
   veya: `cd backend; .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000`
4. **Ağdaki cihazlardan eriş:** `http://<bu-bilgisayarın-IP>:8000`

> ⚠️ **Güvenlik:** Panelde kimlik doğrulama yok — ağdaki herkes müşteri verisini görebilir. Sadece güvenilir yerel ağda kullan.
> ⚠️ **VPN:** Surfshark vb. açıkken yerel ağ erişimi engellenebilir; "yerel ağ paylaşımına izin ver" seçeneğini açın ya da VPN'i geçici durdurun.

## Veri Yükleme (biriktiren / upsert)
- **Panelden:** "↑ Veri Yükle" sekmesinden CSV sürükle-bırak.
- **Komut satırından:**
  - `python -m app.ingestion.run` → biriktirir (sipariş no bazlı upsert, geçmişi korur)
  - `python -m app.ingestion.run --replace` → tüm veriyi sıfırlayıp baştan yükler
- Her yüklemede mükerrer müşteriler (e-posta/telefon/ad) otomatik birleşir; yeni müşteriler tanınır.

## CRM / Kampanya Modülü
Müşteri arama, kupon ve kampanya takibinin panelden yönetildiği yazılabilir katman.
- **CRM sekmesi:** durum, kampanya, arandı/aranacak, kupon kodu/gönderim/bitiş, not — panelden düzenlenir, kalıcıdır (CSV yüklemesinden ayrı saklanır).
- **Otomatik:** kampanya uygunluğu (5+ sipariş→Sadakat, 90+ gün→Nerdesin/25K+%5, yeni→Hoşgeldin), kupon süre durumu (dolmuş/yaklaşan), aranacaklar.
- **Kampanya ROI:** siparişlerdeki indirim toplamından aylık etki.
- **Mevcut Excel CRM'i içeri aktarma** (bir kez):
  ```powershell
  cd backend
  .\.venv\Scripts\python.exe -m app.ingestion.import_crm_excel "../data/GÜNCEL CRM TABLOSU.xlsx"
  ```

## API Endpoint'leri
| Bölüm | Endpoint |
|-------|----------|
| 1 | `GET /api/orders/recent`, `GET /api/orders/trend?period=day|week|month` |
| 2 | `GET /api/stats/summary|top-products|by-city` (hepsi `?start=YYYY-MM-DD&end=YYYY-MM-DD`), `GET /api/stats/months` |
| 3 | `GET /api/customers/rfm`, `/top`, `/churn-risk?days=90`, `/loyalty`, `/new-returning?period=month`, `/daily?date=YYYY-MM-DD` |
| 4 | `GET /api/basket/pairs?min_count=2` |
| Yükleme | `POST /api/ingest/upload` (multipart CSV) |
