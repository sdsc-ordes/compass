"""Stories count proxy tests."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.config import config
from app.namespaces import COMPASS
from app.routers.stories import _wp_tag_ids

DOLPHINS = str(COMPASS.Dolphins)


def _patch_upstream(get: AsyncMock):
    """Patch ``httpx.AsyncClient`` so the router's GET resolves through *get*."""
    upstream = AsyncMock()
    upstream.__aenter__.return_value = upstream
    upstream.__aexit__.return_value = False
    upstream.get = get
    return patch("httpx.AsyncClient", return_value=upstream)


@pytest.mark.parametrize(
    ("ids", "lang", "expected"),
    [
        ([], "en", config.stories_base_url_en),
        ([148], "en", f"{config.stories_base_url_en}?tag=148"),
        ([147, 148, 455], "en", f"{config.stories_base_url_en}?tag=147,148,455"),
        ([148], "de", f"{config.stories_base_url_de}?tag=148"),
    ],
)
def test_frontend_url(ids, lang, expected):
    assert config.create_stories_frontend_url(ids, lang) == expected


def test_api_url_single():
    url = config.create_stories_api_url([148], "en")
    assert url == f"{config.stories_api_url}?tags=148&lang=en&per_page=1&_fields=id"


def test_api_url_multiple():
    url = config.create_stories_api_url([147, 148], "en")
    assert url.startswith(config.stories_api_url)
    assert "tags[terms]=147,148" in url
    assert "tags[operator]=AND" in url
    assert "lang=en" in url


@pytest.mark.parametrize("iris", [[], ["not an iri"]])
def test_no_valid_iri_skips_the_query(iris):
    store = MagicMock()
    assert _wp_tag_ids(iris, store) == []
    store.query.assert_not_called()


def test_wp_tag_ids_from_the_graph(store):
    assert _wp_tag_ids([DOLPHINS, str(COMPASS.NoSuchConcept)], store) == [148]


def test_stories_count_no_tags(client):
    data = client.get("/api/v1/stories/count").json()
    assert data == {
        "count": 0,
        "url": config.stories_base_url_en,
        "status": "no_tags",
        "message": None,
    }


def test_stories_count_unmapped_tag(client, graph):
    """An IRI with no compass:wpTagId returns count=0 without an upstream call."""
    unknown = COMPASS.NoSuchConcept
    assert not list(graph.predicate_objects(unknown))
    with _patch_upstream(AsyncMock()) as client_cls:
        resp = client.get("/api/v1/stories/count", params={"tags": str(unknown)})
    client_cls.assert_not_called()
    data = resp.json()
    assert data["count"] == 0
    assert data["status"] == "no_ID_mapping"
    assert data["message"] is None


def test_stories_count_mapped_tag(client):
    response = MagicMock(headers={"x-wp-total": "42"})
    with _patch_upstream(AsyncMock(return_value=response)):
        resp = client.get("/api/v1/stories/count", params={"tags": DOLPHINS})
    data = resp.json()
    assert data["count"] == 42
    assert data["status"] == "ok"
    assert data["message"] is None
    assert data["url"].endswith("?tag=148")


def test_stories_count_proxy_error(client):
    """A network error returns count=0, still with the filtered URL."""
    with _patch_upstream(AsyncMock(side_effect=httpx.ConnectError("timeout"))):
        resp = client.get("/api/v1/stories/count", params={"tags": DOLPHINS})
    data = resp.json()
    assert data["count"] == 0
    assert data["status"] == "upstream_error"
    assert data["message"] == config.stories_api_error_message
    assert data["url"].endswith("?tag=148")
