# Backend configuration

| File | Holds |
| --- | --- |
| `src/backend/app/core/settings.py` (`Settings`) | Deployment settings (`COMPASS_*`) |
| `src/backend/app/config.py` (`Config`) | Use-case settings: API metadata, stories provider, languages |

Both read environment variables and the repository-root `.env`. Under Compose
the backend container receives `.env` too.

## Deployment settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `COMPASS_USE_CASE` | `oceancare` | Folder under the ontology root holding `compass.ttl` and `vocab.ttl` |
| `COMPASS_ONTOLOGY_DIR` | `src/ontology` of the checkout | Ontology root holding `shapes.ttl` |
| `COMPASS_RELOAD_TOKEN` | empty (reload disabled) | Secret for `POST /api/v1/admin/reload`, sent as `X-Reload-Token`. Anyone holding it can trigger a reload. |
| `COMPASS_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated origins allowed to call the API cross-origin (dev server, embedding sites). Empty disables CORS; Compose defaults to empty. |

The reload endpoint re-parses the ontology without a restart. A rejected reload
keeps the previous version serving.

## Use-case settings

| Variable | Purpose |
| --- | --- |
| `API_TITLE` | Title in the OpenAPI docs |
| `API_WELCOME_MESSAGE` | Message returned by `GET /` and `GET /api/` |
| `STORIES_PROVIDER_NAME` | Provider name in log messages |
| `STORIES_BASE_URL_EN`, `STORIES_BASE_URL_DE` | Public stories index per language |
| `STORIES_API_URL` | Upstream endpoint queried by `GET /api/v1/stories/count` |
| `STORIES_API_ERROR_MESSAGE` | Message returned when the upstream API fails |
| `STORIES_COUNT_HEADER` | Upstream response header holding the count (default `x-wp-total`) |

The defaults target OceanCare's WordPress REST API. For another provider,
override these methods on `Config`:

- `create_stories_frontend_url`, `create_stories_api_url`: query shape of the
  public and upstream URLs.
- `parse_stories_count`: when the count is not in a response header.

## Languages

`Config.supported_langs` is the key set of `Config.stories_base_urls`; routers
reject any other `lang` (`app/core/deps.py`). The widget's interface strings and
the workbook's column pairs exist for `en` and `de` only.

## Check

```bash
just check::tests
```

API reference: [Config](backend/config.md), [Core](backend/core.md).
