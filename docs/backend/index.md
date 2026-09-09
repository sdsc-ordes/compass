# Compass Backend

FastAPI service that holds the Compass ontology and answers the map widget's
queries. Filters and entity shapes are projected from SHACL; SPARQL runs over
Oxigraph; results are returned as GeoJSON.

HTTP routes are documented by FastAPI's OpenAPI UI (`/docs` when the API is
running). This site covers architecture and the Python modules behind those
routes.

## Running

```bash
cd src/backend
uv run uvicorn app.main:app --reload --port 8000
```

## Tests

```bash
cd src/backend
uv run pytest tests/ -v
```

## Local docs

```bash
just docs
just docs-build
```
