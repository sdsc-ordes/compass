"""Tests for the stories count proxy endpoint."""
import pytest
import httpx
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.routers.stories import _resolve_tags_ids, _build_frontend_url, _build_api_url


# ---------------------------------------------------------------------------
# Unit tests for helpers
# ---------------------------------------------------------------------------

def test_build_frontend_url_no_ids():
    url = _build_frontend_url([], "en")
    assert url.endswith("/stories-and-news/")
    assert "?" not in url


def test_build_frontend_url_single():
    url = _build_frontend_url([148], "en")
    assert "?tag=148" in url


def test_build_frontend_url_multiple():
    url = _build_frontend_url([147, 148, 455], "en")
    assert "?tag=147,148,455" in url


def test_build_frontend_url_lang_specific_base():
    assert "/de/" in _build_frontend_url([148], "de")
    assert "/en/" in _build_frontend_url([148], "en")


def test_build_api_url_single():
    url = _build_api_url([148])
    assert "tags=148" in url
    assert "per_page=1" in url
    assert "_fields=id" in url


def test_build_api_url_multiple():
    url = _build_api_url([147, 148])
    assert "tags=147,148" in url


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
        ["http://example.org/ocean-org/ontology#DolphinsAndSmallCetaceans"], store
    )
    assert result == [148]


def test_resolve_tags_ids_multiple():
    store = MagicMock()
    store.query.return_value = [{"wpTagId": "148"}, {"wpTagId": "455"}]
    result = _resolve_tags_ids(
        [
            "http://example.org/ocean-org/ontology#DolphinsAndSmallCetaceans",
            "http://example.org/ocean-org/ontology#AnimalAndSpeciesConservation",
        ],
        store,
    )
    assert set(result) == {148, 455}


# ---------------------------------------------------------------------------
# Integration tests via FastAPI TestClient
# ---------------------------------------------------------------------------

client = TestClient(app)


def test_stories_count_no_tags():
    resp = client.get("/api/stories/count")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 0
    assert "oceancare.org" in data["url"]


def test_stories_count_unmapped_tag():
    """Tags with no compass:wpTagId mapping return count=0 without an HTTP call."""
    resp = client.get(
        "/api/stories/count",
        params={"tag": "http://example.org/ocean-org/ontology#Geoengineering"},
    )
    assert resp.status_code == 200
    assert resp.json()["count"] == 0


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
            params={"tag": "http://example.org/ocean-org/ontology#DolphinsAndSmallCetaceans"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 42
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
            params={"tag": "http://example.org/ocean-org/ontology#DolphinsAndSmallCetaceans"},
        )

    assert resp.status_code == 200
    assert "?tag=" in resp.json()["url"]


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
            params={"tag": "http://example.org/ocean-org/ontology#DolphinsAndSmallCetaceans"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 0
    assert "?tag=148" in data["url"]
