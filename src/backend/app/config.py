"""Deployment-configurable settings, read from the environment at import."""

import os

OCEANCARE_STORIES_URL_EN: str = os.getenv(
    "OCEANCARE_STORIES_URL_EN",
    "https://www.oceancare.org/en/stories-and-news/",
)
OCEANCARE_STORIES_URL_DE: str = os.getenv(
    "OCEANCARE_STORIES_URL_DE",
    "https://www.oceancare.org/de/storys-and-news/",
)

# In production nginx proxies /api on the widget's own origin, so no cross
# origin request is made and this list stays empty. It exists for development,
# where the Vite dev server and the API sit on different ports.
CORS_ORIGINS_ENV = "COMPASS_CORS_ORIGINS"
_DEV_ORIGINS = "http://localhost:5173,http://localhost:4173"


def stories_base_url(lang: str) -> str:
    """The OceanCare stories index for *lang*, English for anything but 'de'."""
    return OCEANCARE_STORIES_URL_DE if lang == "de" else OCEANCARE_STORIES_URL_EN


def entity_stories_url(wp_entity_tag_id: str, lang: str) -> str:
    """The stories index filtered to one entity's WordPress term id.

    One term id serves both language sites; only the base URL differs.
    """
    return f"{stories_base_url(lang)}?tag={wp_entity_tag_id}"


def cors_origins() -> list[str]:
    """Origins allowed to call the API cross-origin, empty for same-origin only."""
    configured = os.environ.get(CORS_ORIGINS_ENV, _DEV_ORIGINS)
    return [origin.strip() for origin in configured.split(",") if origin.strip()]
