# Backend

HTTP routes: OpenAPI UI at `/docs` when the API is running.

Module docs and architecture: [docs site](https://sdsc-ordes.github.io/compass/)
(served locally with `just docs::dev-up`).

## Running

```bash
just backend              # http://127.0.0.1:8780
just backend port=9000    # choose a different port
```

`COMPASS_ENVIRONMENT` defaults to `development` locally, enabling CORS for the
Vite dev server. Set it to `production` to disable development-only middleware;
`docker-compose.yml` defaults to `production`.

## Tests

```bash
uv run pytest tests/ -v
```

## Configuration

Use-case checklist: [backend configuration](https://sdsc-ordes.github.io/compass/configuration-backend/).
Ontology setup: [ontology configuration](https://sdsc-ordes.github.io/compass/configuration-ontology/).
