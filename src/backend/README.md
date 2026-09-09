# Backend

HTTP routes: OpenAPI UI at `/docs` when the API is running.

Module docs and architecture: see [docs/backend](../../docs/backend/index.md)
(served locally with `just docs`).

## Running

```bash
uv run uvicorn app.main:app --reload --port 8000
```

`COMPASS_ENVIRONMENT` defaults to `development` locally, enabling CORS for the
Vite dev server. Set it to `production` to disable development-only middleware;
`docker-compose.yml` defaults to `production`.

## Tests

```bash
uv run pytest tests/ -v
```

## Configuration

Use-case checklist: [docs/backend/configuration.md](../../docs/backend/configuration.md).
