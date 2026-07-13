# Backend

FastAPI application serving ontology data as GeoJSON via SPARQL over RDFLib.

## Running

```bash
uv run uvicorn app.main:app --reload --port 8000
```

## Tests

```bash
uv run pytest tests/ -v
```
