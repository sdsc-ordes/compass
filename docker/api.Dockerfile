# Build context is the repo root: the app needs ontology/ as well as backend/.
FROM python:3.11-slim

RUN pip install --no-cache-dir uv

WORKDIR /srv/backend

COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --frozen --no-dev

COPY backend/app ./app
COPY ontology /srv/ontology

EXPOSE 8000
CMD ["uv", "run", "--no-dev", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
