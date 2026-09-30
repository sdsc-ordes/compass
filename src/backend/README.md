# Backend

FastAPI service that serves filters, entities and story counts from the ontology.
With the API running, the OpenAPI UI is at `/docs`.

## Run

```bash
just backend           # http://127.0.0.1:8780 (COMPASS_HTTP_PORT), hot reload
just backend 9000      # another port
```

`COMPASS_CORS_ORIGINS` defaults to the Vite dev server origins; under
`docker-compose.yml` it is empty unless set.

## Test

```bash
cd src/backend && uv run pytest
```

## Configure

- [Backend configuration](https://sdsc-ordes.github.io/compass/configuration-backend/)
- [Ontology configuration](https://sdsc-ordes.github.io/compass/configuration-ontology/)
- Module reference and request flow: [docs site](https://sdsc-ordes.github.io/compass/)
  (`just docs::dev-up` serves it locally)
