# Backend

Not required to run the map — the widget queries its own bundled RDF in the browser
(`frontend/src/engine/`). This FastAPI app remains for three reasons:

- `scripts/export_static.py` generates what the browser engine needs from the ontology
- `/api/stories/count` proxies OceanCare's WordPress stories (needs a server: cross-origin)
- it is the reference implementation the engine is verified against

## Running

```bash
uv run uvicorn app.main:app --reload --port 8000
```

## Tests

```bash
uv run pytest tests/ -v
```
