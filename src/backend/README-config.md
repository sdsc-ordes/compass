# Configuring the Backend for a New Use-case

Use-case settings live in `app/config.py` (pydantic `Config`). Platform / deployment
settings live in `app/core/settings.py`. A Python-proficient user should be able to
adapt the backend for a new use-case by editing `app/config.py` (and optional env
overrides).

## Minimal Checklist

1. **Set API metadata** (`app/config.py` / env)
   - `API_TITLE` — title shown in the FastAPI docs.
   - `API_WELCOME_MESSAGE` — payload returned by `GET /`.

2. **Configure to your website (stories provider)** (`app/config.py`)
   - `STORIES_PROVIDER_NAME` — provider name used in log messages.
   - `STORIES_BASE_URL_EN` / `STORIES_BASE_URL_DE` (and `stories_base_urls`) — public index URLs.
   - `STORIES_API_URL` — upstream endpoint queried by `/api/v1/stories/count`.
   - `STORIES_API_ERROR_MESSAGE` — message returned when the upstream API fails.
   - Override `Config.create_stories_frontend_url` / `create_stories_api_url` if the
     provider uses a different query shape.
   - Override `Config.parse_stories_count` (or set `stories_count_header`) if the
     upstream count is not in the default response header.

3. **Adapt language support**
   - Add or remove language base URLs on `Config` so `supported_langs` updates.
   - Routers read allowed `lang` values from `Config` via `app/core/deps.py` — do not
     hardcode `en|de` in routes.

4. **Run the test suite** (sanity check)

   ```bash
   uv run pytest tests/ -v
   ```
