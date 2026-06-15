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
            assert f["type"] in {"multiselect", "slider", "datepicker", "toggle"}

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
        point = next(f for f in data["features"] if not f["properties"].get("is_region"))
        assert point["type"] == "Feature"
        assert point["geometry"]["type"] == "Point"
        assert len(point["geometry"]["coordinates"]) == 2
        assert "id" in point["properties"]
        assert "label" in point["properties"]

    def test_region_features(self, client):
        data = client.get("/api/entities?lang=en").json()
        regions = [f for f in data["features"] if f["properties"].get("is_region")]
        assert len(regions) >= 20
        assert all(r["geometry"] is None for r in regions)
        assert all(r["properties"].get("regionKey") for r in regions)

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


class TestFacetsEndpoint:
    def test_returns_200(self, client):
        resp = client.get("/api/entities/facets?lang=en")
        assert resp.status_code == 200

    def test_shape_is_dict_of_dicts_of_ints(self, client):
        data = client.get("/api/entities/facets?lang=en").json()
        assert isinstance(data, dict)
        assert len(data) > 0
        for dim, counts in data.items():
            assert isinstance(counts, dict)
            for iri, n in counts.items():
                assert iri.startswith("http")
                assert isinstance(n, int) and n > 0

    def test_excludes_non_thematic_dimensions(self, client):
        data = client.get("/api/entities/facets?lang=en").json()
        assert "entityType" not in data
        assert "relatedProject" not in data
        assert "forum" not in data

    def test_includes_expected_dimensions(self, client):
        data = client.get("/api/entities/facets?lang=en").json()
        assert "countryArea" in data
        assert "species" in data

    def test_lang_exposes_same_dimensions(self, client):
        # Counts may differ across languages: an entity without a label in the
        # requested language is filtered out (same as on the map). But the set
        # of tag dimensions exposed is the same.
        en = client.get("/api/entities/facets?lang=en").json()
        de = client.get("/api/entities/facets?lang=de").json()
        assert set(en.keys()) == set(de.keys())

    def test_drilldown_keeps_own_dimension_siblings(self, client):
        """Selecting a value in a dimension must NOT shrink that dimension's own
        counts — siblings stay pickable (OR-within-dimension drill-down)."""
        base = client.get("/api/entities/facets?lang=en").json()
        dim = "countryArea"
        value, count = next(iter(base[dim].items()))
        after = client.get(
            "/api/entities/facets", params={"lang": "en", dim: value}
        ).json()
        assert after[dim][value] == count

    def test_other_dimensions_never_grow_when_filtered(self, client):
        """A filter on one dimension can only constrain (<=) other dimensions."""
        base = client.get("/api/entities/facets?lang=en").json()
        dim = "species"
        value = next(iter(base[dim].keys()))
        after = client.get(
            "/api/entities/facets", params={"lang": "en", dim: value}
        ).json()
        for other_dim, counts in after.items():
            if other_dim == dim:
                continue
            for iri, n in counts.items():
                assert n <= base[other_dim].get(iri, 0)

    def test_count_matches_filtered_entities(self, client):
        """A facet count for a value equals the entities the map renders when
        that value is the only active filter — same domain, same constraint."""
        base = client.get("/api/entities/facets?lang=en").json()
        dim = "species"
        value, count = next(iter(base[dim].items()))
        entities = client.get(
            "/api/entities", params={"lang": "en", dim: value}
        ).json()
        assert count == len(entities["features"])


class TestStatesEndpoint:
    def test_save_returns_id(self, client):
        resp = client.post("/api/states/save", json={"zoom": 4, "center": [0, 20]})
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert isinstance(data["id"], str)
        assert len(data["id"]) > 0

    def test_round_trip(self, client):
        payload = {"zoom": 7, "center": [10.0, 53.5], "filters": {"country": "Germany"}}
        save_resp = client.post("/api/states/save", json=payload)
        state_id = save_resp.json()["id"]

        load_resp = client.get(f"/api/states/{state_id}")
        assert load_resp.status_code == 200
        assert load_resp.json() == payload

    def test_unknown_id_returns_404(self, client):
        resp = client.get("/api/states/doesnotexist")
        assert resp.status_code == 404


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
