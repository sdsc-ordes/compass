"""HTTP endpoint tests against the real ontology."""

import pytest

from app.core.settings import settings
from app.namespaces import ALWAYS_ON_CLASSES, COMPASS, FILTERABLE_PIN_CLASSES

# Two species the fixture data shares across several entities, so the
# intersection of the two is neither empty nor either one of them.
SPECIES_A = str(COMPASS.Dolphins)
SPECIES_B = str(COMPASS.Whales)

ALWAYS_ON_IRIS = {str(COMPASS[name]) for name in ALWAYS_ON_CLASSES}


def result_pins(features: list[dict]) -> list[dict]:
    """Return the pins the facets count: every feature but the always-on ones."""
    return [f for f in features if f["properties"]["typeIri"] not in ALWAYS_ON_IRIS]


def pin_ids(client, params: list[tuple[str, str]]) -> set[str]:
    """Return the ids of the pins GET /entities returns for *params*."""
    data = client.get("/api/v1/entities", params=[("lang", "en"), *params]).json()
    return {f["properties"]["id"] for f in data["features"]}


@pytest.mark.parametrize("lang", ["en", "de"])
def test_filters_are_well_formed(client, lang):
    resp = client.get("/api/v1/filters", params={"lang": lang})
    assert resp.status_code == 200
    filters = resp.json()
    assert filters
    for f in filters:
        assert {"id", "label", "type"} <= f.keys()
        assert f["type"] in {"multiselect", "slider", "datepicker", "toggle"}


def test_unsupported_lang_is_rejected(client):
    assert client.get("/api/v1/filters", params={"lang": "fr"}).status_code == 400


def test_cors_allows_only_configured_origins(client):
    allowed = settings.cors_origins[0]
    response = client.get("/", headers={"Origin": allowed})
    assert response.headers["access-control-allow-origin"] == allowed
    response = client.get("/", headers={"Origin": "https://elsewhere.example"})
    assert "access-control-allow-origin" not in response.headers


def test_entity_type_offers_only_filterable_classes(client):
    filters = client.get("/api/v1/filters", params={"lang": "en"}).json()
    entity_type = next(f for f in filters if f["id"] == "entityType")
    offered = {option["value"] for option in entity_type["options"]}
    assert offered == {str(COMPASS[name]) for name in FILTERABLE_PIN_CLASSES}


class TestEntitiesEndpoint:
    @pytest.mark.parametrize("lang", ["en", "de"])
    def test_every_feature_is_a_drawable_pin(self, client, lang):
        resp = client.get("/api/v1/entities", params={"lang": lang})
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "FeatureCollection"
        assert data["features"]
        for feature in data["features"]:
            assert feature["type"] == "Feature"
            assert feature["geometry"]["type"] == "Point"
            assert len(feature["geometry"]["coordinates"]) == 2
            assert {"id", "label"} <= feature["properties"].keys()

    def test_two_values_in_one_dimension_intersect(self, client):
        a = pin_ids(client, [("species", SPECIES_A)])
        b = pin_ids(client, [("species", SPECIES_B)])
        both = pin_ids(client, [("species", SPECIES_A), ("species", SPECIES_B)])
        assert both, "the fixture must hold entities carrying both tags"
        assert both == a & b
        assert len(both) < len(a) and len(both) < len(b)

    def test_two_dimensions_intersect(self, client):
        topic = str(COMPASS.Shipping)
        species_only = pin_ids(client, [("species", SPECIES_A)])
        topic_only = pin_ids(client, [("topic", topic)])
        together = pin_ids(client, [("species", SPECIES_A), ("topic", topic)])
        assert together == species_only & topic_only

    def test_one_value_keeps_only_its_carriers(self, client):
        data = client.get(
            "/api/v1/entities", params={"lang": "en", "species": SPECIES_A}
        ).json()
        pins = result_pins(data["features"])
        assert pins
        assert all(SPECIES_A in str(f["properties"].get("species", "")) for f in pins)

    def test_an_always_on_pin_survives_every_filter(self, client):
        """The host carries every concept, so only an undefined tag can exclude it."""
        data = client.get(
            "/api/v1/entities",
            params={"lang": "en", "species": str(COMPASS.NoSuchSpecies)},
        ).json()
        assert {f["properties"]["typeIri"] for f in data["features"]} == ALWAYS_ON_IRIS

    def test_entity_type_values_combine_with_or(self, client):
        partner = ("entityType", str(COMPASS.PartnerOrganization))
        network = ("entityType", str(COMPASS.Network))
        either = pin_ids(client, [partner]) | pin_ids(client, [network])
        assert pin_ids(client, [partner, network]) == either


class TestFacetsEndpoint:
    def test_counts_every_tag_dimension_and_entity_type(self, client):
        data = client.get("/api/v1/entities/facets?lang=en").json()
        assert set(data) == {
            "countryArea",
            "entityType",
            "programme",
            "species",
            "topic",
            "workArea",
        }
        for counts in data.values():
            for iri, n in counts.items():
                assert iri.startswith("http")
                assert isinstance(n, int) and n > 0

    def test_counts_exclude_the_host_but_entities_return_it_once(self, client):
        """The frontend adds the host to every count, so the backend never counts it."""
        params = {"lang": "en", "species": SPECIES_A}
        features = client.get("/api/v1/entities", params=params).json()["features"]
        hosts = [f for f in features if f["properties"]["typeIri"] in ALWAYS_ON_IRIS]
        assert len(hosts) == 1
        facets = client.get("/api/v1/entities/facets", params=params).json()
        assert not set(facets["entityType"]) & ALWAYS_ON_IRIS
        assert facets["species"][SPECIES_A] == len(features) - 1

    def test_entity_type_counts_match_the_entities(self, client):
        features = client.get("/api/v1/entities?lang=en").json()["features"]
        expected: dict[str, int] = {}
        for feature in result_pins(features):
            type_iri = feature["properties"]["typeIri"]
            expected[type_iri] = expected.get(type_iri, 0) + 1

        counts = client.get("/api/v1/entities/facets?lang=en").json()["entityType"]
        assert counts == expected
        assert set(counts) <= {str(COMPASS[name]) for name in FILTERABLE_PIN_CLASSES}

    def test_lang_exposes_same_dimensions(self, client):
        # Counts may differ: an entity without a name in the requested language
        # is dropped, as on the map.
        en = client.get("/api/v1/entities/facets?lang=en").json()
        de = client.get("/api/v1/entities/facets?lang=de").json()
        assert set(en) == set(de)

    def test_a_sibling_count_is_what_adding_it_would_return(self, client):
        after = client.get(
            "/api/v1/entities/facets", params={"lang": "en", "species": SPECIES_A}
        ).json()
        both = client.get(
            "/api/v1/entities",
            params=[("lang", "en"), ("species", SPECIES_A), ("species", SPECIES_B)],
        ).json()
        assert after["species"][SPECIES_B] == len(result_pins(both["features"]))

    def test_sibling_counts_shrink_once_a_value_is_picked(self, client):
        base = client.get("/api/v1/entities/facets?lang=en").json()
        after = client.get(
            "/api/v1/entities/facets", params={"lang": "en", "species": SPECIES_A}
        ).json()
        assert after["species"][SPECIES_B] < base["species"][SPECIES_B]

    def test_a_picked_value_counts_the_whole_selection(self, client):
        after = client.get(
            "/api/v1/entities/facets", params={"lang": "en", "species": SPECIES_A}
        ).json()
        entities = client.get(
            "/api/v1/entities", params={"lang": "en", "species": SPECIES_A}
        ).json()
        assert after["species"][SPECIES_A] == len(result_pins(entities["features"]))

    def test_entity_type_counts_ignore_its_own_selection(self, client):
        """Otherwise every unpicked class would read zero."""
        base = client.get("/api/v1/entities/facets?lang=en").json()["entityType"]
        after = client.get(
            "/api/v1/entities/facets",
            params={"lang": "en", "entityType": str(COMPASS.Network)},
        ).json()["entityType"]
        assert after == base

    def test_other_dimensions_never_grow_when_filtered(self, client):
        base = client.get("/api/v1/entities/facets?lang=en").json()
        dim = "species"
        value = next(iter(base[dim].keys()))
        after = client.get(
            "/api/v1/entities/facets", params={"lang": "en", dim: value}
        ).json()
        for other_dim, counts in after.items():
            if other_dim == dim:
                continue
            for iri, n in counts.items():
                assert n <= base[other_dim].get(iri, 0)

    def test_count_matches_filtered_entities(self, client):
        base = client.get("/api/v1/entities/facets?lang=en").json()
        dim = "species"
        value, count = next(iter(base[dim].items()))
        entities = client.get("/api/v1/entities", params={"lang": "en", dim: value}).json()
        assert count == len(result_pins(entities["features"]))

    def test_cross_dimension_count_matches_filtered_entities(self, client):
        faroes = str(COMPASS.FaroeIslands)
        chem = str(COMPASS.ChemicalPollution)
        data = client.get(
            "/api/v1/entities/facets",
            params={"lang": "en", "countryArea": faroes},
        ).json()
        entities = client.get(
            "/api/v1/entities",
            params={"lang": "en", "countryArea": faroes, "topic": chem},
        ).json()
        assert data["topic"].get(chem, 0) == len(result_pins(entities["features"]))


class TestEntityDetailEndpoint:
    def test_returns_detail(self, client):
        entities = client.get("/api/v1/entities?lang=en").json()
        entity_id = entities["features"][0]["properties"]["id"]
        resp = client.get("/api/v1/entities/detail", params={"iri": entity_id})
        assert resp.status_code == 200
        assert resp.json()

    @pytest.mark.parametrize(
        "iri",
        [
            # A '>' would close the IRIREF and let the rest become graph patterns.
            "http://example.org/a> ?p ?o } UNION { ?x ?p ?o . #",
            "http://example.org/a b",
        ],
    )
    def test_rejects_an_unsafe_iri(self, client, iri):
        resp = client.get("/api/v1/entities/detail", params={"iri": iri})
        assert resp.status_code == 400


class TestCorsPolicy:
    def test_unlisted_origin_is_not_echoed_back(self, client):
        resp = client.get(
            "/api/v1/filters?lang=en", headers={"Origin": "https://evil.example"}
        )
        assert resp.headers.get("access-control-allow-origin") not in {
            "*",
            "https://evil.example",
        }

    def test_dev_origin_is_allowed(self, client):
        resp = client.get(
            "/api/v1/filters?lang=en", headers={"Origin": "http://localhost:5173"}
        )
        assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"
