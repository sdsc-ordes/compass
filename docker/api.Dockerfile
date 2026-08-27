# Build context is the repo root: the app needs src/ontology as well as src/backend.
FROM python:3.11-slim

RUN pip install --no-cache-dir uv

# Mirrors the repo layout, because app/rdf.py locates the ontology relative to
# its own file (three levels up).
WORKDIR /srv/src/backend

COPY src/backend/pyproject.toml src/backend/uv.lock src/backend/.python-version ./
RUN uv sync --frozen --no-dev

COPY src/backend/app ./app
COPY src/ontology /srv/src/ontology

EXPOSE 8000
CMD ["uv", "run", "--no-dev", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
