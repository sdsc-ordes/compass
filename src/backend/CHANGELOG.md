# Backend Changelog

## Unreleased

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
- Added `README-config.md` documenting how to adapt the backend for a new use-case by editing `app/config.py`.
