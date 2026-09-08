"""Deployment-configurable settings, read from the environment at import."""

import os

# In production nginx proxies /api on the widget's own origin, so no cross
# origin request is made and this list stays empty. It exists for development,
# where the Vite dev server and the API sit on different ports.
CORS_ORIGINS_ENV = "COMPASS_CORS_ORIGINS"
_DEV_ORIGINS = "http://localhost:5173,http://localhost:4173"


# API metadata
# ------------

API_TITLE: str = os.getenv("API_TITLE", "Compass API")
API_WELCOME_MESSAGE: str = os.getenv(
    "API_WELCOME_MESSAGE", "Compass API is running."
)


# Stories provider configuration
# ------------------------------
# The provider name is used in log messages. The base URLs and API URL drive
# the /api/stories/count endpoint.

STORIES_PROVIDER_NAME: str = os.getenv("STORIES_PROVIDER_NAME", "OceanCare")

STORIES_BASE_URL_EN: str = os.getenv(
    "STORIES_BASE_URL_EN",
    "https://www.oceancare.org/en/stories-and-news/",
)
STORIES_BASE_URL_DE: str = os.getenv(
    "STORIES_BASE_URL_DE",
    "https://www.oceancare.org/de/storys-and-news/",
)

STORIES_BASE_URLS: dict[str, str] = {
    "en": STORIES_BASE_URL_EN,
    "de": STORIES_BASE_URL_DE,
}

STORIES_API_URL: str = os.getenv(
    "STORIES_API_URL",
    "https://www.oceancare.org/wp-json/wp/v2/stories",
)

STORIES_API_ERROR_MESSAGE: str = os.getenv(
    "STORIES_API_ERROR_MESSAGE",
    "Unable to load story count. Please try again or contact OceanCare.",
)


def create_stories_base_url(lang: str) -> str:
    """The stories index for *lang*, English for anything but 'de'."""
    return STORIES_BASE_URLS.get(lang, STORIES_BASE_URL_EN)


def entity_stories_url(wp_entity_tag_id: str, lang: str) -> str:
    """The stories index filtered to one entity's term id.

    One term id serves both language sites; only the base URL differs.
    """
    return f"{create_stories_base_url(lang)}?tag={wp_entity_tag_id}"


def create_stories_frontend_url(ids: list[int], lang: str) -> str:
    """The public stories index URL filtered to *ids*.

    The default shape appends `?tag=<id1,id2,...>` to the language-specific
    base URL. Override this function if the provider uses a different query
    parameter or path scheme.
    """
    base = create_stories_base_url(lang)
    if not ids:
        return base
    tags_param = ",".join(str(i) for i in ids)
    return f"{base}?tag={tags_param}"


def create_stories_api_url(ids: list[int], lang: str) -> str:
    """The upstream stories API URL that returns a count for *ids*.

    The default query shape matches the OceanCare WordPress REST API:
    a single tag uses `?tags=<id>`; multiple tags use the array-style
    `?tags[terms]=...&tags[operator]=AND` form so only stories tagged with
    all of them are counted. Override this function for a different API.
    """
    if len(ids) == 1:
        return f"{STORIES_API_URL}?tags={ids[0]}&lang={lang}&per_page=1&_fields=id"
    terms = ",".join(str(i) for i in ids)
    return (
        f"{STORIES_API_URL}?tags[terms]={terms}"
        f"&tags[operator]=AND&lang={lang}&per_page=1&_fields=id"
    )


def cors_origins() -> list[str]:
    """Origins allowed to call the API cross-origin, empty for same-origin only."""
    configured = os.environ.get(CORS_ORIGINS_ENV, _DEV_ORIGINS)
    return [origin.strip() for origin in configured.split(",") if origin.strip()]
