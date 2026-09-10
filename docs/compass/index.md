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
uv run uvicorn app.main:app --reload --port 8780
```

## Environment

`COMPASS_ENVIRONMENT` controls development-only middleware:

- `development` (default) — enables CORS for local frontends.
- `production` — disables CORS; `docker-compose.yml` defaults to this.

Override with the env var, e.g. `COMPASS_ENVIRONMENT=production`.

## Tests

```bash
cd src/backend
uv run pytest tests/ -v
```

## Local docs

```bash
just docs::dev-up
just docs::build
```
