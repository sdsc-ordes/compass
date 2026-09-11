# CHANGELOG

## Unreleased

### Widget rebuilt on the v4 design

- Replace `App.svelte`, `map/Map.svelte` and `shared/*` with `components/`,
  `lib/` and `styles/`: a filter accordion with one section open at a time,
  counted type pills as the panel's landing control, a detail pane, a coach
  overlay and a mobile sheet.
- Draw the basemap as SVG with `d3-geo` over the bundled Natural Earth topology
  (`src/atlas.json`, `just map::atlas`), with pins on a canvas; drop
  `maplibre-gl`, `lucide-svelte` and `qrcode`.
- Keep the MapLibre-era bathymetry pipeline (`just map::tiles`, the dev-server
  route and the nginx mount) for a later trial; the SVG stage does not draw it.
- Take the map's data from the API rather than a bundled Oxigraph: `init(apiurl)`
  fetches the filter widgets, and the widget no longer ships the ontology.
- Take each entity's "read more" link from the API's `storiesUrl` instead of
  building it from a WordPress tag id per language.
- Drop the `?state=` restore path, whose endpoint went in the backend refactor.
- Retire `share/index.html`; `tools/docker/index.html` is the one demo page.
- Self-host Cabin and Cabin Condensed (`just map::fonts`) instead of loading
  them from Google Fonts, which was the widget's last third-party request.
- Call the story count at `/api/v1/stories/count` with `tags`, matching the
  router; it was calling `/api/stories/count` with `tag` and silently counting
  nothing.
- Pin the vite dev server with `strictPort`, so it cannot drift out of the API's
  CORS allowlist.

### Frontend configuration

- Read the repository-root `.env` from `vite.config.ts`, the same file Compose
  and `settings.py` read: `COMPASS_DEV_PORT` sets the dev server's port and
  `COMPASS_API_URL` (or `COMPASS_HTTP_PORT`) fills the dev page's `apiurl`. Both
  default to what `settings.py` expects, so no `.env` is required.
- Take the stories link's URL from the API instead of the two oceancare.org URLs
  the widget hard-coded; a tagless request answers with the deployment's own.
- Write `docs/compass/configuration-frontend.md`, including what remains
  use-case specific in the widget and needs a rebuild.

### Filter options carry a definition

- Add `definition_en` / `definition_de` to the concepts sheet; a filled cell
  becomes `skos:definition` and reaches the panel as an option's `description`.
  The key is absent, never null, when a concept defines nothing.

### Facets

- Count entities per type: `/entities/facets` now returns an `entityType`
  dimension, counted over the class `_pin_branch` binds.

### Fixes

- Write bathymetry tiles to `src/frontend/tiles/`, which is what compose mounts
  and git ignores; `build-tiles.mjs` and the vite dev route wrote to
  `src/frontend/tools/`.
- Run `ruff` through `uv` in `check.just`: it is a dev dependency of the Python
  projects, not a tool on `PATH` in the nix dev shell.

### Docs refactor

- Split configuration docs into `configuration-ontology.md`,
  `configuration-backend.md`, and `configuration-frontend.md`; update the root
  README Configuration section and MkDocs nav accordingly.
- Rename MkDocs content directory `docs/backend/` → `docs/compass/`.

### Ontology layout and turtle generator

- Move OceanCare instance data under `src/ontology/oceancare/` (`source-data.ods`,
  `compass.ttl`, `vocab.ttl`); keep shared `shapes.ttl` / `shacl-shacl.ttl` at the
  ontology root.
- Add `src/ontology/template-source-data.ods` as the empty workbook starter for a
  new use-case.
- Rename `src/update-data/` → `src/turtle-generator/` and `tsv_to_rdf.py` →
  `ods_to_rdf.py`; rename the Just recipe `data::update` → `data::generate`.
- Introduce `COMPASS_USE_CASE` (default `oceancare`): `COMPASS_ONTOLOGY_DIR` is
  the ontology root; instance Turtle and the workbook live under
  `{COMPASS_ONTOLOGY_DIR}/{COMPASS_USE_CASE}/`. Startup load, admin reload, and
  the generator all follow that setting.

### Justfile modules

- Split recipes into `tools/just/` modules: `data`, `map`, `docs`, and `check`.
- Root keeps local-dev and deploy entry points:
  `dev-up`, and `deploy`.

### Map asset scripts

- Move `build-tiles.mjs` from `tools/scripts/` into `src/frontend/scripts/`
  alongside `build-regions.mjs` and `build-basemap.mjs`; tiles write to
  `src/frontend/tools/` (gitignored).

### Deployment / Docker

- Default compose host port `8080` → `8780` (`COMPASS_HTTP_PORT` to override).
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
- Add `docs` dependency group, `just docs::dev-up` / `just docs::build`
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
