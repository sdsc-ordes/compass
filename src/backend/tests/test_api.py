"""API integration tests.

Full-stack tests using FastAPI's TestClient to verify the HTTP endpoints
work correctly against the real ontology.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.namespaces import ALWAYS_ON_CLASSES, COMPASS, PIN_CLASSES

# Two species the fixture data shares across several entities, so the
# intersection of the two is neither empty nor either one of them.
SPECIES_A = str(COMPASS.Dolphins)
SPECIES_B = str(COMPASS.Whales)

ALWAYS_ON_IRIS = {str(COMPASS[name]) for name in ALWAYS_ON_CLASSES}


def result_pins(features: list[dict]) -> list[dict]:
    """The point features the selection produced.

    Two kinds of feature come back that no count reports: a region is background
    context with no geometry, and an always-on pin is drawn whatever the filters
    say, so neither belongs in a total the filter panel prints.
    """
    return [
        f
        for f in features
        if not f["properties"].get("is_region")
        and f["properties"]["typeIri"] not in ALWAYS_ON_IRIS
    ]


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


class TestFiltersEndpoint:
    def test_returns_200(self, client):
        resp = client.get("/api/v1/filters?lang=en")
        assert resp.status_code == 200

    def test_returns_list(self, client):
        data = client.get("/api/v1/filters?lang=en").json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_each_filter_has_required_keys(self, client):
        data = client.get("/api/v1/filters?lang=en").json()
        for f in data:
            assert "id" in f
            assert "label" in f
            assert "type" in f
            assert f["type"] in {"multiselect", "slider", "datepicker", "toggle"}

    def test_german_works(self, client):
        data = client.get("/api/v1/filters?lang=de").json()
        assert isinstance(data, list)
        assert len(data) > 0


class TestEntitiesEndpoint:
    def test_returns_200(self, client):
        resp = client.get("/api/v1/entities?lang=en")
        assert resp.status_code == 200

    def test_returns_geojson(self, client):
        data = client.get("/api/v1/entities?lang=en").json()
        assert data["type"] == "FeatureCollection"
        assert "features" in data

    def test_has_features(self, client):
        data = client.get("/api/v1/entities?lang=en").json()
        assert len(data["features"]) > 0

    def test_feature_structure(self, client):
        data = client.get("/api/v1/entities?lang=en").json()
        point = next(f for f in data["features"] if not f["properties"].get("is_region"))
        assert point["type"] == "Feature"
        assert point["geometry"]["type"] == "Point"
        assert len(point["geometry"]["coordinates"]) == 2
        assert "id" in point["properties"]
        assert "label" in point["properties"]

    def test_region_features(self, client):
        data = client.get("/api/v1/entities?lang=en").json()
        regions = [f for f in data["features"] if f["properties"].get("is_region")]
        assert regions, "no region reached the map"
        assert all(r["geometry"] is None for r in regions)
        assert all(r["properties"].get("regionKey") for r in regions)

    def test_entity_type_filter(self, client):
        all_data = client.get("/api/v1/entities?lang=en").json()
        # Get the type IRI from the first entity to use as a filter
        first_type = all_data["features"][0]["properties"]["typeIri"]
        filtered = client.get(
            "/api/v1/entities", params={"lang": "en", "entityType": first_type}
        ).json()
        assert len(filtered["features"]) > 0
        assert len(filtered["features"]) <= len(all_data["features"])

    def test_two_values_in_one_dimension_intersect(self, client):
        """Picking a second tag narrows the map: the result is the entities
        carrying both tags, not the entities carrying either."""

        def pins(*values: str) -> set[str]:
            params = [("lang", "en")] + [("species", v) for v in values]
            data = client.get("/api/v1/entities", params=params).json()
            return {
                f["properties"]["id"]
                for f in data["features"]
                if not f["properties"].get("is_region")
            }

        a, b = pins(SPECIES_A), pins(SPECIES_B)
        both = pins(SPECIES_A, SPECIES_B)
        assert both, "the fixture must hold entities carrying both tags"
        assert both == a & b
        assert both != a | b
        assert len(both) < len(a) and len(both) < len(b)

    def test_two_dimensions_still_and(self, client):
        """Across dimensions nothing changed: the two constraints still stack."""

        def pins(params: list[tuple[str, str]]) -> set[str]:
            data = client.get("/api/v1/entities", params=[("lang", "en"), *params]).json()
            return {
                f["properties"]["id"]
                for f in data["features"]
                if not f["properties"].get("is_region")
            }

        topic = str(COMPASS.Shipping)
        species_only = pins([("species", SPECIES_A)])
        topic_only = pins([("topic", topic)])
        together = pins([("species", SPECIES_A), ("topic", topic)])
        assert together == species_only & topic_only

    def test_one_value_is_unaffected(self, client):
        """A lone pick still means exactly the entities carrying that tag."""
        data = client.get(
            "/api/v1/entities", params={"lang": "en", "species": SPECIES_A}
        ).json()
        pins = result_pins(data["features"])
        assert pins
        assert all(SPECIES_A in str(f["properties"].get("species", "")) for f in pins)

    def test_an_always_on_pin_survives_every_filter(self, client):
        """The host organization is the map's subject, so it is drawn even when
        the selection excludes it -- and it is no part of what was selected.

        The tag picked exists in no vocabulary, which is the one selection
        guaranteed to match nothing however the workbook changes.
        """
        data = client.get(
            "/api/v1/entities",
            params={"lang": "en", "species": str(COMPASS.NoSuchSpecies)},
        ).json()
        types = {f["properties"]["typeIri"] for f in data["features"]}
        assert types >= ALWAYS_ON_IRIS, "an always-on pin was filtered off the map"
        assert not result_pins(data["features"]), (
            "a selection matching nothing still reported results"
        )

    def test_regions_narrow_with_their_pins(self, client):
        """A region is shaded by one pin passing every filter, so two tags
        shade only where a single pin carries both."""

        def regions(*values: str) -> set[str]:
            params = [("lang", "en")] + [("species", v) for v in values]
            data = client.get("/api/v1/entities", params=params).json()
            return {
                f["properties"]["regionKey"]
                for f in data["features"]
                if f["properties"].get("is_region")
            }

        a, b = regions(SPECIES_A), regions(SPECIES_B)
        both = regions(SPECIES_A, SPECIES_B)
        assert both
        assert both <= a and both <= b

    def test_entity_type_is_still_disjunctive(self, client):
        """An entity has exactly one class, so two picks there mean "either" --
        AND would empty the map."""

        def pins(*types: str) -> set[str]:
            params = [("lang", "en")] + [("entityType", t) for t in types]
            data = client.get("/api/v1/entities", params=params).json()
            return {
                f["properties"]["id"]
                for f in data["features"]
                if not f["properties"].get("is_region")
            }

        partner, network = str(COMPASS.PartnerOrganization), str(COMPASS.Network)
        assert pins(partner, network) == pins(partner) | pins(network)

    def test_german_entities(self, client):
        data = client.get("/api/v1/entities?lang=de").json()
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) > 0


class TestFacetsEndpoint:
    def test_returns_200(self, client):
        resp = client.get("/api/v1/entities/facets?lang=en")
        assert resp.status_code == 200

    def test_shape_is_dict_of_dicts_of_ints(self, client):
        data = client.get("/api/v1/entities/facets?lang=en").json()
        assert isinstance(data, dict)
        assert len(data) > 0
        for counts in data.values():
            assert isinstance(counts, dict)
            for iri, n in counts.items():
                assert iri.startswith("http")
                assert isinstance(n, int) and n > 0

    def test_excludes_relations(self, client):
        # forum points at another pin rather than at a tag, so a count under it
        # would not mean what a count under a tag means. programme used to be
        # here too and is now a vocabulary like any other.
        data = client.get("/api/v1/entities/facets?lang=en").json()
        assert "forum" not in data
        assert "programme" in data

    def test_counts_entity_types(self, client):
        # entityType has no property shape -- it is the class _pin_branch BINDs --
        # so it is asked for by name. The filter panel leads with these counts.
        data = client.get("/api/v1/entities/facets?lang=en").json()
        assert "entityType" in data
        counts = data["entityType"]
        assert counts, "every fixture entity has a class, so this cannot be empty"
        assert set(counts) <= {str(COMPASS[name]) for name in PIN_CLASSES}

    def test_entity_type_counts_match_the_entities(self, client):
        # The same drill-down rule as every other dimension: a dimension's own
        # selection is excluded from its counts, so these are the totals per
        # class across the unfiltered set.
        features = client.get("/api/v1/entities?lang=en").json()["features"]
        expected: dict[str, int] = {}
        for feature in result_pins(features):
            type_iri = feature["properties"]["typeIri"]
            expected[type_iri] = expected.get(type_iri, 0) + 1

        counts = client.get("/api/v1/entities/facets?lang=en").json()["entityType"]
        assert counts == expected

    def test_includes_expected_dimensions(self, client):
        data = client.get("/api/v1/entities/facets?lang=en").json()
        assert "countryArea" in data
        assert "species" in data

    def test_lang_exposes_same_dimensions(self, client):
        # Counts may differ across languages: an entity without a label in the
        # requested language is filtered out (same as on the map). But the set
        # of tag dimensions exposed is the same.
        en = client.get("/api/v1/entities/facets?lang=en").json()
        de = client.get("/api/v1/entities/facets?lang=de").json()
        assert set(en.keys()) == set(de.keys())

    def test_a_sibling_count_is_what_adding_it_would_return(self, client):
        """Values within a dimension AND together, so a count reads "results if
        I also pick this" — including for siblings in the picked dimension."""
        dim, first, second = "species", SPECIES_A, SPECIES_B
        after = client.get(
            "/api/v1/entities/facets", params={"lang": "en", dim: first}
        ).json()
        both = client.get(
            "/api/v1/entities", params=[("lang", "en"), (dim, first), (dim, second)]
        ).json()
        assert after[dim][second] == len(result_pins(both["features"]))

    def test_sibling_counts_shrink_once_a_value_is_picked(self, client):
        """The point of AND: a sibling can only narrow what is already selected."""
        base = client.get("/api/v1/entities/facets?lang=en").json()
        after = client.get(
            "/api/v1/entities/facets", params={"lang": "en", "species": SPECIES_A}
        ).json()
        assert after["species"][SPECIES_B] < base["species"][SPECIES_B]

    def test_a_picked_value_counts_the_whole_selection(self, client):
        """Re-picking what is already picked changes nothing, so its count is
        the current result total rather than a number that vanishes."""
        after = client.get(
            "/api/v1/entities/facets", params={"lang": "en", "species": SPECIES_A}
        ).json()
        entities = client.get(
            "/api/v1/entities", params={"lang": "en", "species": SPECIES_A}
        ).json()
        assert after["species"][SPECIES_A] == len(result_pins(entities["features"]))

    def test_entity_type_counts_stay_drilldown(self, client):
        """entityType is disjunctive, so its own pick must stay out of its
        counts — otherwise every unpicked class would read zero."""
        base = client.get("/api/v1/entities/facets?lang=en").json()["entityType"]
        after = client.get(
            "/api/v1/entities/facets",
            params={"lang": "en", "entityType": str(COMPASS.Network)},
        ).json()["entityType"]
        assert after == base

    def test_other_dimensions_never_grow_when_filtered(self, client):
        """A filter on one dimension can only constrain (<=) other dimensions."""
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
        """A facet count for a value equals the point features the map renders
        when that value is the only active filter. Regions are background
        context and excluded from both the facet count and the result badge."""
        base = client.get("/api/v1/entities/facets?lang=en").json()
        dim = "species"
        value, count = next(iter(base[dim].items()))
        entities = client.get("/api/v1/entities", params={"lang": "en", dim: value}).json()
        assert count == len(result_pins(entities["features"]))

    def test_counts_exclude_regions(self, client):
        """Faroe Islands carries compass:topic ChemicalPollution as a region, but
        the topic facet must not count it — only the pin itself."""
        faroes = str(COMPASS.FaroeIslands)
        data = client.get(
            "/api/v1/entities/facets",
            params={"lang": "en", "countryArea": faroes},
        ).json()
        chem = str(COMPASS.ChemicalPollution)
        entities = client.get(
            "/api/v1/entities",
            params={"lang": "en", "countryArea": faroes, "topic": chem},
        ).json()
        assert data["topic"].get(chem, 0) == len(result_pins(entities["features"]))


class TestEntityDetailEndpoint:
    def test_returns_detail(self, client):
        # First get an entity ID from the list
        entities = client.get("/api/v1/entities?lang=en").json()
        entity_id = entities["features"][0]["properties"]["id"]
        resp = client.get("/api/v1/entities/detail", params={"iri": entity_id})
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) > 0

    def test_rejects_an_iri_that_would_escape_the_query(self, client):
        # A '>' would close the IRIREF and let the rest become graph patterns.
        resp = client.get(
            "/api/v1/entities/detail",
            params={"iri": "http://example.org/a> ?p ?o } UNION { ?x ?p ?o . #"},
        )
        assert resp.status_code == 400

    def test_rejects_whitespace_in_an_iri(self, client):
        resp = client.get(
            "/api/v1/entities/detail",
            params={"iri": "http://example.org/a b"},
        )
        assert resp.status_code == 400


class TestCorsPolicy:
    def test_unlisted_origin_is_not_echoed_back(self, client):
        resp = client.get(
            "/api/v1/filters?lang=en", headers={"Origin": "https://evil.example"}
        )
        assert resp.headers.get("access-control-allow-origin") != "*"
        assert resp.headers.get("access-control-allow-origin") != "https://evil.example"

    def test_dev_origin_is_allowed(self, client):
        resp = client.get(
            "/api/v1/filters?lang=en", headers={"Origin": "http://localhost:5173"}
        )
        assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"
