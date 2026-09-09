# Backend Changelog

## Unreleased

### Deployment / Docker

- Rename Compose services: `api` → `backend`, `web` → `frontend`.
- Move Docker assets from `docker/` to `tools/docker/` and update all
  references (`docker-compose.yml`, `README.md`, frontend Dockerfile).
- Add `.env.example` at the project root documenting backend environment
  variables for both local development and Docker Compose.
- Load the project-root `.env` file automatically in `app/core/settings.py`
  when it exists; Docker Compose-injected variables continue to take
  precedence.

#### API / routing for Docker deployment

- Add a dedicated `/api/` welcome route so the widget's API probe succeeds.
- Disable FastAPI's automatic trailing-slash redirects
  (`redirect_slashes=False`) to avoid 307 redirect issues with same-origin
  nginx proxying.
- Define collection routes without trailing slashes (`/api/v1/filters`,
  `/api/v1/entities`) and update the frontend engine to match.

### Development settings

- Add `COMPASS_ENVIRONMENT` setting (`development` default locally, `production`
  in `docker-compose.yml`) and `app/core/development.py` for development-only
  middleware such as CORS.

### Docs: MkDocs for the backend

- Add Material MkDocs under `docs/backend/`
- Add `docs` dependency group, `just docs` / `just docs-build`
- Add `.github/workflows/mkdocs-ci.yml` (deploy to GitHub Pages on `main`)
- Drop `README-config.md` to bring the markdown documentation under docs (one sourth of truth).

### Refactor: query / GeoJSON layer

- Split `schema.py` into `shacl_to_filters.py` (UI `FilterWidget`) and
  `shacl_to_entities.py` (typed `EntityShape` for SPARQL + GeoJSON).
- Rename `result_parser.py` → `sparql_to_geojson_translator.py`.
- Wire builder, translator, RDF store, and tests to `EntityShape` attribute access.
- Clarify shapes vs instances: `get_entity_shape_from_shacl` / `get_entities`,
  `sparql_for_instances`, `instances_to_geojson`.
- Rename helpers: `get_filters_from_shacl`, `read_graph`, `get_shacl_property`,
  `get_shacl_label`; type `EntityShape` (was `EntityProperty`).
- Move filter UI route from `GET /api/v1/filters/schema` to
  `GET /api/v1/filters`; expose `FilterWidget` (was `FilterDimension` /
  `FilterSchemaEntry`).

### Refactor: RDF store singleton lifecycle

- Move the module-level `store_instance` global and its helpers (`get_store`, `reload_store`, `_build_store`, `_validate`) into `RDFStore` as class-level singleton methods (`instance`, `reload_instance`, `from_settings`) and an instance `validate` method.
- Update FastAPI dependencies and the admin reload endpoint to use `RDFStore.instance()` and `RDFStore.reload_instance()`.
- Centralize `ReloadError` and `QueryError` in `app/core/exceptions.py` so all API-facing errors live with the other domain exceptions.

### Refactor: API following Best Practices

- Introduce `app/core/` for platform settings, shared dependencies, and exception handlers.
- Split platform settings into `core/settings.py` and remodel use-case `config.py` as a pydantic `Config` (including stories count parsing).
- Add Pydantic response schemas for filters, stories, admin, and a thin GeoJSON FeatureCollection; attach them via `response_model`.
- Centralize API errors in `core/` handlers, including `InvalidTerm`, `QueryError`, and `ReloadError`, behind one JSON `detail` shape.
- Version public HTTP routes under `/api/v1/` and update the widget and tests accordingly.
- Drive allowed `lang` query values from use-case `Config` instead of hardcoding `en|de` in routers.
- Remove unused map-state router and leftover local state database.
- Stories counting: Move into `config.py` stories count parsing and align stories under `/api/v1/stories/count`.

### Refactor: OceanCare agnostic backend

- Generalized the stories proxy:
  - configurable `STORIES_BASE_URL_*`, `STORIES_API_URL`, `STORIES_PROVIDER_NAME`, and `STORIES_API_ERROR_MESSAGE` in `app/config.py`.
  - Moved URL construction functions from `app/routers/stories.py` into `app/config.py`.
  - updated log messages and the upstream-error response to use the configured provider name and error message.
- Added API metadata environment variables (`API_TITLE`, `API_WELCOME_MESSAGE`) and removed hard-coded "OceanCare" references from `app/main.py` and `pyproject.toml`.
- Updated `tests/test_stories.py` to assert against the new configurable constants.
- Added `docs/backend/configuration.md` documenting how to adapt the backend for a new use-case by editing `app/config.py`.
