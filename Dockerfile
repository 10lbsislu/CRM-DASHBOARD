# --- 1) Frontend build (Node) ---
FROM node:20-slim AS fe
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- 2) Backend runtime (Python) ---
FROM python:3.13-slim AS app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ /app/backend/
# Build edilmiş frontend'i backend'in beklediği yola koy (/app/frontend/dist)
COPY --from=fe /fe/dist /app/frontend/dist

EXPOSE 8010
# Render PORT env'ini verir; yoksa 8010
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8010}
