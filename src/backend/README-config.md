# Configuring the Backend for a New Use-Case

All deployment-specific settings live in `app/config.py`. A Python-proficient user should be able to adapt the backend for a new use-case by editing only this file.

## Minimal Checklist

1. **Set API metadata**
   - `API_TITLE` — title shown in the FastAPI docs.
   - `API_WELCOME_MESSAGE` — payload returned by `GET /`.

2. **Configure the stories provider**
   - `STORIES_PROVIDER_NAME` — provider name used in log messages.
   - `STORIES_BASE_URLS` — mapping from language code to the public stories index URL.
   - `STORIES_API_URL` — upstream endpoint queried by `/api/stories/count` for counts.
   - `STORIES_API_ERROR_MESSAGE` — message returned to the widget when the upstream API fails.
   - `create_stories_frontend_url(ids, lang)` — builds the public stories URL from term IDs. Override if the provider uses a different query parameter or path scheme.
   - `create_stories_api_url(ids, lang)` — builds the upstream count URL from term IDs. Override if the API uses a different query shape.

3. **Adapt language support**
   - Add or remove entries in `STORIES_BASE_URLS`.
   - Update `create_stories_base_url(lang)` if the fallback language should differ from `"en"`.
   - Update the `lang` query parameter pattern in `app/routers/stories.py` if supported languages change.

4. **Override via environment variables (optional)**
   - `API_TITLE`
   - `API_WELCOME_MESSAGE`
   - `STORIES_PROVIDER_NAME`
   - `STORIES_BASE_URL_EN`, `STORIES_BASE_URL_DE`, ...
   - `STORIES_API_URL`
   - `STORIES_API_ERROR_MESSAGE`
   - `COMPASS_CORS_ORIGINS`

5. **Run the test suite**

   ```bash
   uv run pytest tests/ -v
   ```
