"""Use-case configuration. Adapt a deployment by editing this file (and env overrides)."""

from __future__ import annotations

import httpx
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    """Use-case knobs: API metadata, languages, and the stories provider."""

    model_config = SettingsConfigDict(extra="ignore")

    api_title: str = Field(
        default="Compass API",
        validation_alias="API_TITLE",
        description="Title shown in the FastAPI / OpenAPI docs.",
    )
    api_welcome_message: str = Field(
        default="Compass API is running.",
        validation_alias="API_WELCOME_MESSAGE",
        description="Payload message returned by GET /.",
    )

    stories_provider_name: str = Field(
        default="OceanCare",
        validation_alias="STORIES_PROVIDER_NAME",
        description="Provider name used in log messages.",
    )
    stories_base_url_en: str = Field(
        default="https://www.oceancare.org/en/stories-and-news/",
        validation_alias="STORIES_BASE_URL_EN",
        description="Public stories index URL for English.",
    )
    stories_base_url_de: str = Field(
        default="https://www.oceancare.org/de/storys-and-news/",
        validation_alias="STORIES_BASE_URL_DE",
        description="Public stories index URL for German.",
    )
    stories_api_url: str = Field(
        default="https://www.oceancare.org/wp-json/wp/v2/stories",
        validation_alias="STORIES_API_URL",
        description="Upstream endpoint queried by /api/v1/stories/count.",
    )
    stories_api_error_message: str = Field(
        default="Unable to load story count. Please try again or contact OceanCare.",
        validation_alias="STORIES_API_ERROR_MESSAGE",
        description="Message returned when the upstream stories API fails.",
    )

    # Default upstream count header for the OceanCare WordPress REST API.
    # Override parse_stories_count for a different provider.
    stories_count_header: str = Field(
        default="x-wp-total",
        description="Response header holding the total story count.",
    )

    @property
    def stories_base_urls(self) -> dict[str, str]:
        """Map language code → public stories index URL.

        Returns:
            Dict keyed by language code.
        """
        return {
            "en": self.stories_base_url_en,
            "de": self.stories_base_url_de,
        }

    @property
    def supported_langs(self) -> list[str]:
        """Language codes accepted by the ``lang`` query parameter.

        Returns:
            Keys of ``stories_base_urls``.
        """
        return list(self.stories_base_urls.keys())

    def create_stories_base_url(self, lang: str) -> str:
        """Return the stories index for *lang*, falling back to English.

        Args:
            lang: Requested language code.

        Returns:
            Public index URL.
        """
        return self.stories_base_urls.get(lang, self.stories_base_url_en)

    def entity_stories_url(self, entity_tag_id: str, lang: str) -> str:
        """Build a public stories index URL filtered to one entity's term id.

        Args:
            entity_tag_id: Upstream term id (``wpEntityTagId``).
            lang: UI language.

        Returns:
            URL with a ``tag`` query parameter.
        """
        return f"{self.create_stories_base_url(lang)}?tag={entity_tag_id}"

    def create_stories_frontend_url(self, ids: list[int], lang: str) -> str:
        """Build a public stories index URL filtered to *ids*.

        Default shape: ``?tag=<id1,id2,...>``. Override for a different scheme.

        Args:
            ids: Upstream term ids.
            lang: UI language.

        Returns:
            Public URL for user navigation.
        """
        base = self.create_stories_base_url(lang)
        if not ids:
            return base
        tags_param = ",".join(str(i) for i in ids)
        return f"{base}?tag={tags_param}"

    def create_stories_api_url(self, ids: list[int], lang: str) -> str:
        """Build the upstream stories API URL that returns a count for *ids*.

        Default query shape matches the OceanCare WordPress REST API.
        Override for a different API.

        Args:
            ids: Upstream term ids.
            lang: UI language.

        Returns:
            Upstream request URL.
        """
        if len(ids) == 1:
            return f"{self.stories_api_url}?tags={ids[0]}&lang={lang}&per_page=1&_fields=id"
        terms = ",".join(str(i) for i in ids)
        return (
            f"{self.stories_api_url}?tags[terms]={terms}"
            f"&tags[operator]=AND&lang={lang}&per_page=1&_fields=id"
        )

    def parse_stories_count(self, response: httpx.Response) -> int:
        """Extract the story count from an upstream HTTP response.

        Default: read the configured count header (WordPress ``X-WP-Total``).
        Override for a different response shape.

        Args:
            response: Successful upstream response.

        Returns:
            Integer story count (0 when the header is missing).
        """
        return int(response.headers.get(self.stories_count_header, 0))


config = Config()

# Module-level aliases kept for callers and tests that import constants/helpers.
API_TITLE = config.api_title
API_WELCOME_MESSAGE = config.api_welcome_message
STORIES_PROVIDER_NAME = config.stories_provider_name
STORIES_BASE_URL_EN = config.stories_base_url_en
STORIES_BASE_URL_DE = config.stories_base_url_de
STORIES_BASE_URLS = config.stories_base_urls
STORIES_API_URL = config.stories_api_url
STORIES_API_ERROR_MESSAGE = config.stories_api_error_message


def create_stories_base_url(lang: str) -> str:
    """Delegate to ``config.create_stories_base_url``.

    Args:
        lang: Requested language code.

    Returns:
        Public index URL.
    """
    return config.create_stories_base_url(lang)


def entity_stories_url(entity_tag_id: str, lang: str) -> str:
    """Delegate to ``config.entity_stories_url``.

    Args:
        entity_tag_id: Upstream term id.
        lang: UI language.

    Returns:
        Public URL filtered to one entity.
    """
    return config.entity_stories_url(entity_tag_id, lang)


def create_stories_frontend_url(ids: list[int], lang: str) -> str:
    """Delegate to ``config.create_stories_frontend_url``.

    Args:
        ids: Upstream term ids.
        lang: UI language.

    Returns:
        Public URL for user navigation.
    """
    return config.create_stories_frontend_url(ids, lang)


def create_stories_api_url(ids: list[int], lang: str) -> str:
    """Delegate to ``config.create_stories_api_url``.

    Args:
        ids: Upstream term ids.
        lang: UI language.

    Returns:
        Upstream request URL.
    """
    return config.create_stories_api_url(ids, lang)


def parse_stories_count(response: httpx.Response) -> int:
    """Delegate to ``config.parse_stories_count``.

    Args:
        response: Successful upstream response.

    Returns:
        Integer story count.
    """
    return config.parse_stories_count(response)
