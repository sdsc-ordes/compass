# Backend

HTTP routes: OpenAPI UI at `/docs` when the API is running.

Module docs and architecture: see [docs/backend](../../docs/backend/index.md)
(served locally with `just docs`).

## Running

```bash
uv run uvicorn app.main:app --reload --port 8000
```

## Tests

```bash
uv run pytest tests/ -v
```

## Configuration

Use-case checklist: [docs/backend/configuration.md](../../docs/backend/configuration.md).
