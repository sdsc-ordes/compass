"""Tests for the stories count proxy endpoint."""
import pytest
import httpx
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.routers.stories import _count_story_cards, _resolve_wp_tag_ids, _build_stories_url


# ---------------------------------------------------------------------------
# Unit tests for helpers
# ---------------------------------------------------------------------------

def test_count_story_cards_empty():
    assert _count_story_cards("") == 0


def test_count_story_cards_one():
    html = '<div class="col grid-3"><div class="box">story</div></div>'
    assert _count_story_cards(html) == 1


def test_count_story_cards_multiple():
    html = (
        '<div class="col grid-3">a</div>'
        '<div class="col grid-3">b</div>'
        '<div class="col grid-3">c</div>'
    )
    assert _count_story_cards(html) == 3


def test_count_story_cards_real_response():
    html = """
    <section id="story">
      <div class="content-wrapper grid-3">
        <div class="col grid-3"><div class="box"></div></div>
        <div class="col grid-3"><div class="box"></div></div>
      </div>
    </section>
    """
    assert _count_story_cards(html) == 2


def test_build_stories_url_no_ids():
    url = _build_stories_url([])
    assert url.endswith("/storys-and-news/")
    assert "?" not in url


def test_build_stories_url_single():
    url = _build_stories_url([148])
    assert "?tag=148" in url


def test_build_stories_url_multiple():
    url = _build_stories_url([147, 148, 455])
    assert "?tag=147,148,455" in url


def test_resolve_wp_tag_ids_no_iris():
    store = MagicMock()
    result = _resolve_wp_tag_ids([], store)
    assert result == []
    store.query.assert_not_called()


def test_resolve_wp_tag_ids_unmapped():
    store = MagicMock()
    store.query.return_value = []
    result = _resolve_wp_tag_ids(["http://example.org/ocean-org/ontology#UnknownConcept"], store)
    assert result == []


def test_resolve_wp_tag_ids_known():
    store = MagicMock()
    store.query.return_value = [{"wpTagId": "148"}]
    result = _resolve_wp_tag_ids(
        ["http://example.org/ocean-org/ontology#Dolphins"], store
    )
    assert result == [148]


def test_resolve_wp_tag_ids_multiple():
    store = MagicMock()
    store.query.return_value = [{"wpTagId": "148"}, {"wpTagId": "455"}]
    result = _resolve_wp_tag_ids(
        [
            "http://example.org/ocean-org/ontology#Dolphins",
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
    """A mapped tag triggers a GET to the filtered stories URL; card count is returned."""
    fake_html = (
        '<div class="col grid-3">story1</div>'
        '<div class="col grid-3">story2</div>'
        '<div class="col grid-3">story3</div>'
    )

    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.text = fake_html
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        resp = client.get(
            "/api/stories/count",
            params={"tag": "http://example.org/ocean-org/ontology#Dolphins"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 3
    assert "?tag=148" in data["url"]


def test_stories_count_url_contains_tag_ids(monkeypatch):
    """The returned URL contains the WP tag IDs for direct navigation."""
    with patch("httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_resp = MagicMock()
        mock_resp.text = '<div class="col grid-3">s</div>'
        mock_client.get = AsyncMock(return_value=mock_resp)
        mock_client_cls.return_value = mock_client

        resp = client.get(
            "/api/stories/count",
            params={"tag": "http://example.org/ocean-org/ontology#Dolphins"},
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
            params={"tag": "http://example.org/ocean-org/ontology#Dolphins"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 0
    assert "?tag=148" in data["url"]
