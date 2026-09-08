# Backend Changelog

## Unreleased

- Generalized the stories proxy:
  - configurable `STORIES_BASE_URL_*`, `STORIES_API_URL`, `STORIES_PROVIDER_NAME`, and `STORIES_API_ERROR_MESSAGE` in `app/config.py`.
  - Moved URL construction functions from `app/routers/stories.py` into `app/config.py`.
  - updated log messages and the upstream-error response to use the configured provider name and error message.
- Added API metadata environment variables (`API_TITLE`, `API_WELCOME_MESSAGE`) and removed hard-coded "OceanCare" references from `app/main.py` and `pyproject.toml`.
- Updated `tests/test_stories.py` to assert against the new configurable constants.
- Added `README-config.md` documenting how to adapt the backend for a new use-case by editing `app/config.py`.
