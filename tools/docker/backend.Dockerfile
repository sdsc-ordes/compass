# Build context: the repository root (needs src/backend and src/ontology).
FROM python:3.11-slim

RUN pip install --no-cache-dir uv

# Mirrors the repo layout: app/core/settings.py resolves the default ontology
# dir (src/ontology) relative to its own path.
WORKDIR /srv/src/backend

COPY src/backend/pyproject.toml src/backend/uv.lock ./
RUN uv sync --frozen --no-dev

COPY src/backend/app ./app

# Baseline data for running the image alone. Compose mounts src/ontology at
# COMPASS_ONTOLOGY_DIR instead, so data updates need no rebuild.
COPY src/ontology /srv/src/ontology

EXPOSE 8000
CMD ["uv", "run", "--no-dev", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
