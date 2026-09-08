"""Use-case configuration. Adapt a deployment by editing this file (and env overrides)."""

from __future__ import annotations

import httpx
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    """Use-case knobs: API metadata, languages, and the stories provider."""

    model_config = SettingsConfigDict(extra="ignore")

    api_title: str = Field(default="Compass API", validation_alias="API_TITLE")
    api_welcome_message: str = Field(
        default="Compass API is running.",
        validation_alias="API_WELCOME_MESSAGE",
    )

    stories_provider_name: str = Field(
        default="OceanCare",
        validation_alias="STORIES_PROVIDER_NAME",
    )
    stories_base_url_en: str = Field(
        default="https://www.oceancare.org/en/stories-and-news/",
        validation_alias="STORIES_BASE_URL_EN",
    )
    stories_base_url_de: str = Field(
        default="https://www.oceancare.org/de/storys-and-news/",
        validation_alias="STORIES_BASE_URL_DE",
    )
    stories_api_url: str = Field(
        default="https://www.oceancare.org/wp-json/wp/v2/stories",
        validation_alias="STORIES_API_URL",
    )
    stories_api_error_message: str = Field(
        default="Unable to load story count. Please try again or contact OceanCare.",
        validation_alias="STORIES_API_ERROR_MESSAGE",
    )

    # Default upstream count header for the OceanCare WordPress REST API.
    # Override parse_stories_count for a different provider.
    stories_count_header: str = Field(default="x-wp-total")

    @property
    def stories_base_urls(self) -> dict[str, str]:
        return {
            "en": self.stories_base_url_en,
            "de": self.stories_base_url_de,
        }

    @property
    def supported_langs(self) -> list[str]:
        return list(self.stories_base_urls.keys())

    def create_stories_base_url(self, lang: str) -> str:
        """The stories index for *lang*, falling back to English."""
        return self.stories_base_urls.get(lang, self.stories_base_url_en)

    def entity_stories_url(self, entity_tag_id: str, lang: str) -> str:
        """Public stories index filtered to one entity's term id."""
        return f"{self.create_stories_base_url(lang)}?tag={entity_tag_id}"

    def create_stories_frontend_url(self, ids: list[int], lang: str) -> str:
        """Public stories index URL filtered to *ids*.

        Default shape: `?tag=<id1,id2,...>`. Override for a different scheme.
        """
        base = self.create_stories_base_url(lang)
        if not ids:
            return base
        tags_param = ",".join(str(i) for i in ids)
        return f"{base}?tag={tags_param}"

    def create_stories_api_url(self, ids: list[int], lang: str) -> str:
        """Upstream stories API URL that returns a count for *ids*.

        Default query shape matches the OceanCare WordPress REST API.
        Override for a different API.
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

        Default: read the configured count header (WordPress `X-WP-Total`).
        Override for a different response shape.
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
    return config.create_stories_base_url(lang)


def entity_stories_url(entity_tag_id: str, lang: str) -> str:
    return config.entity_stories_url(entity_tag_id, lang)


def create_stories_frontend_url(ids: list[int], lang: str) -> str:
    return config.create_stories_frontend_url(ids, lang)


def create_stories_api_url(ids: list[int], lang: str) -> str:
    return config.create_stories_api_url(ids, lang)


def parse_stories_count(response: httpx.Response) -> int:
    return config.parse_stories_count(response)
