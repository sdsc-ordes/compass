# Backend

FastAPI over an in-memory Oxigraph store. Serves the map's data:

- `/api/entities` — GeoJSON FeatureCollection, filtered by query params
- `/api/entities/facets` — per-tag counts for the current selection
- `/api/filters/schema` — filter UI definitions derived from the SHACL shapes
- `/api/states` — save and restore shared map views
- `/api/stories/count` — proxies OceanCare's WordPress stories (server-side to bypass CORS)

The frontend on this branch requires it to be running.

## Running

```bash
uv run uvicorn app.main:app --reload --port 8000
```

## Tests

```bash
uv run pytest tests/ -v
```
