"""Tests for the stories count proxy endpoint."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi.testclient import TestClient

from app.config import (
    STORIES_API_URL,
    STORIES_BASE_URL_DE,
    STORIES_BASE_URL_EN,
    STORIES_API_ERROR_MESSAGE,
    create_stories_api_url,
    create_stories_frontend_url,
)
from app.main import app
from app.routers.stories import _resolve_tags_ids


# ---------------------------------------------------------------------------
# Unit tests for helpers
# ---------------------------------------------------------------------------

def test_build_frontend_url_no_ids():
    url = create_stories_frontend_url([], "en")
    assert url == STORIES_BASE_URL_EN
    assert "?" not in url


def test_build_frontend_url_single():
    url = create_stories_frontend_url([148], "en")
    assert "?tag=148" in url


def test_build_frontend_url_multiple():
    url = create_stories_frontend_url([147, 148, 455], "en")
    assert "?tag=147,148,455" in url


def test_build_frontend_url_lang_specific_base():
    assert STORIES_BASE_URL_DE in create_stories_frontend_url([148], "de")
    assert STORIES_BASE_URL_EN in create_stories_frontend_url([148], "en")


def test_build_api_url_single():
    url = create_stories_api_url([148], "en")
    assert STORIES_API_URL in url
    assert "tags=148" in url
    assert "lang=en" in url
    assert "per_page=1" in url
    assert "_fields=id" in url


def test_build_api_url_multiple():
    url = create_stories_api_url([147, 148], "en")
    assert STORIES_API_URL in url
    assert "tags[terms]=147,148" in url
    assert "tags[operator]=AND" in url
    assert "lang=en" in url


def test_resolve_tags_ids_no_iris():
    store = MagicMock()
    result = _resolve_tags_ids([], store)
    assert result == []
    store.query.assert_not_called()


def test_resolve_tags_ids_unmapped():
    store = MagicMock()
    store.query.return_value = []
    result = _resolve_tags_ids(["http://example.org/ocean-org/ontology#UnknownConcept"], store)
    assert result == []


def test_resolve_tags_ids_known():
    store = MagicMock()
    store.query.return_value = [{"wpTagId": "148"}]
    result = _resolve_tags_ids(
        ["http://example.org/ocean-org/ontology#Dolphins"], store
    )
    assert result == [148]


def test_resolve_tags_ids_multiple():
    store = MagicMock()
    store.query.return_value = [{"wpTagId": "147"}, {"wpTagId": "455"}]
    result = _resolve_tags_ids(
        [
            "http://example.org/ocean-org/ontology#Whales",
            "http://example.org/ocean-org/ontology#SpeciesConservation",
        ],
        store,
    )
    assert set(result) == {147, 455}


# ---------------------------------------------------------------------------
# Integration tests via FastAPI TestClient
# ---------------------------------------------------------------------------

client = TestClient(app)


def test_stories_count_no_tags():
    resp = client.get("/api/stories/count")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 0
    assert data["status"] == "no_tags"
    assert data["message"] is None
    assert data["url"] == STORIES_BASE_URL_EN


def test_stories_count_unmapped_tag():
    """Tags with no compass:wpTagId mapping return count=0 without an HTTP call."""
    resp = client.get(
        "/api/stories/count",
        params={"tags": "http://example.org/ocean-org/ontology#AdvocacyWork"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 0
    assert data["status"] == "no_ID_mapping"
    assert data["message"] is None


def test_stories_count_mapped_tag(monkeypatch):
    """A mapped tag triggers a GET to the WP API; X-WP-Total header count is returned."""
    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.headers = {"x-wp-total": "42"}
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        resp = client.get(
            "/api/stories/count",
            params={"tags": "http://example.org/ocean-org/ontology#Dolphins"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 42
    assert data["status"] == "ok"
    assert data["message"] is None
    assert "?tag=148" in data["url"]


def test_stories_count_url_contains_tag_ids(monkeypatch):
    """The returned URL contains the WP tag IDs for direct navigation."""
    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.headers = {"x-wp-total": "1"}
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        resp = client.get(
            "/api/stories/count",
            params={"tags": "http://example.org/ocean-org/ontology#Dolphins"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "?tag=" in data["url"]


def test_stories_count_proxy_error(monkeypatch):
    """A network error returns count=0 gracefully, still with the filtered URL."""
    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("timeout"))
        mock_client_cls.return_value = mock_client

        resp = client.get(
            "/api/stories/count",
            params={"tags": "http://example.org/ocean-org/ontology#Dolphins"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 0
    assert data["status"] == "upstream_error"
    assert data["message"] == STORIES_API_ERROR_MESSAGE
    assert "?tag=148" in data["url"]
