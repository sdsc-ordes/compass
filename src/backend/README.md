# Backend

HTTP routes: OpenAPI UI at `/docs` when the API is running.

Module docs and architecture: see [docs/compass](../../docs/compass/index.md)
(served locally with `just docs::dev-up`).

## Running

```bash
just backend              # http://127.0.0.1:8780
just backend port=9000    # choose a different port
```

Or from this directory:

```bash
uv run uvicorn app.main:app --reload --port 8780
```

`COMPASS_ENVIRONMENT` defaults to `development` locally, enabling CORS for the
Vite dev server. Set it to `production` to disable development-only middleware;
`docker-compose.yml` defaults to `production`.

## Tests

```bash
uv run pytest tests/ -v
```

## Configuration

Use-case checklist: [docs/compass/configuration-backend.md](../../docs/compass/configuration-backend.md).
Ontology setup: [docs/compass/configuration-ontology.md](../../docs/compass/configuration-ontology.md).
