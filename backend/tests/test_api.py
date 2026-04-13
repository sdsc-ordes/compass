"""API integration tests.

Full-stack tests using FastAPI's TestClient to verify the HTTP endpoints
work correctly against the real ontology.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


class TestFiltersEndpoint:
    def test_returns_200(self, client):
        resp = client.get("/api/filters/schema?lang=en")
        assert resp.status_code == 200

    def test_returns_list(self, client):
        data = client.get("/api/filters/schema?lang=en").json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_each_filter_has_required_keys(self, client):
        data = client.get("/api/filters/schema?lang=en").json()
        for f in data:
            assert "id" in f
            assert "label" in f
            assert "type" in f
            assert f["type"] in {"multiselect", "slider", "datepicker"}

    def test_german_works(self, client):
        data = client.get("/api/filters/schema?lang=de").json()
        assert isinstance(data, list)
        assert len(data) > 0


class TestEntitiesEndpoint:
    def test_returns_200(self, client):
        resp = client.get("/api/entities?lang=en")
        assert resp.status_code == 200

    def test_returns_geojson(self, client):
        data = client.get("/api/entities?lang=en").json()
        assert data["type"] == "FeatureCollection"
        assert "features" in data

    def test_has_features(self, client):
        data = client.get("/api/entities?lang=en").json()
        assert len(data["features"]) > 0

    def test_feature_structure(self, client):
        data = client.get("/api/entities?lang=en").json()
        feature = data["features"][0]
        assert feature["type"] == "Feature"
        assert feature["geometry"]["type"] == "Point"
        assert len(feature["geometry"]["coordinates"]) == 2
        assert "id" in feature["properties"]
        assert "label" in feature["properties"]

    def test_entity_type_filter(self, client):
        all_data = client.get("/api/entities?lang=en").json()
        # Get the type IRI from the first entity to use as a filter
        first_type = all_data["features"][0]["properties"]["typeIri"]
        filtered = client.get("/api/entities", params={"lang": "en", "entityType": first_type}).json()
        assert len(filtered["features"]) > 0
        assert len(filtered["features"]) <= len(all_data["features"])

    def test_german_entities(self, client):
        data = client.get("/api/entities?lang=de").json()
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) > 0


class TestEntityDetailEndpoint:
    def test_returns_detail(self, client):
        # First get an entity ID from the list
        entities = client.get("/api/entities?lang=en").json()
        entity_id = entities["features"][0]["properties"]["id"]
        resp = client.get("/api/entities/detail", params={"iri": entity_id})
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0
