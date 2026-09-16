FROM node:20-alpine AS web-build

WORKDIR /web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ ./
COPY 素材/ /素材/
RUN npm run build

FROM python:3.12-slim

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fonts-noto-cjk \
        libreoffice-writer \
        pandoc \
        poppler-utils \
    && rm -rf /var/lib/apt/lists/*
COPY apps/api/pyproject.toml ./
COPY apps/api/app ./app
COPY apps/api/alembic ./alembic
COPY apps/api/alembic.ini ./
ARG PIP_INDEX_URL=https://pypi.org/simple
RUN pip install --no-cache-dir --timeout 120 --index-url "$PIP_INDEX_URL" .
COPY --from=web-build /web/dist ./static

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
