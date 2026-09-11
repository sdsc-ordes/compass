"""SPARQL → GeoJSON translator tests."""

from starlette.datastructures import QueryParams

from app.shacl_to_entities import EntityShape
from app.sparql_builder import sparql_for_instances
from app.sparql_to_geojson_translator import (
    _parse_special_properties,
    extract_property,
    instances_to_geojson,
)


def _ep(**kwargs) -> EntityShape:
    defaults = {
        "path_iri": "http://example.org/x",
        "category": "simple_literal",
        "is_multi": False,
        "filter_type": "none",
        "datatype": None,
    }
    defaults.update(kwargs)
    return EntityShape(**defaults)


class TestParseSpecialProperties:
    def test_builds_the_english_stories_url(self):
        props = _parse_special_properties({"wpEntityTagId": "921"}, "en")
        assert props["storiesUrl"].endswith("?tag=921")
        assert "/en/" in props["storiesUrl"]

    def test_builds_the_german_stories_url(self):
        props = _parse_special_properties({"wpEntityTagId": "921"}, "de")
        assert props["storiesUrl"].endswith("?tag=921")
        assert "/de/" in props["storiesUrl"]

    def test_no_tag_id_means_no_url(self):
        assert _parse_special_properties({}, "en")["storiesUrl"] == ""


class TestExtractProperty:
    def test_multi_iri_with_label(self):
        spec = _ep(id="workArea", category="iri_with_label", is_multi=True)
        res = {"workAreaRaw": "http://ex.org/A|LabelA;;http://ex.org/B|LabelB"}
        result = extract_property(spec, res)
        assert len(result) == 2
        assert result[0] == {"iri": "http://ex.org/A", "label": "LabelA"}

    def test_single_iri_with_label(self):
        spec = _ep(id="funding", category="iri_with_label", is_multi=False)
        res = {"fundingIri": "http://ex.org/public", "fundingLabel": "Public"}
        result = extract_property(spec, res)
        assert result == {"iri": "http://ex.org/public", "label": "Public"}

    def test_boolean(self):
        spec = _ep(id="active", category="boolean", is_multi=False)
        assert extract_property(spec, {"activeResult": "true"}) is True
        assert extract_property(spec, {"activeResult": "false"}) is False

    def test_multi_literal(self):
        spec = _ep(id="activities", category="lang_literal", is_multi=True)
        res = {"activitiesRaw": "Research;;Education;;Policy"}
        result = extract_property(spec, res)
        assert result == ["Research", "Education", "Policy"]


class TestResultsToGeojsonIntegration:
    def test_round_trip_produces_features(self, store, property_specs):
        sparql = sparql_for_instances(property_specs, "en", QueryParams(""))
        results = store.query(sparql)
        geojson = instances_to_geojson(results, property_specs)
        assert geojson["type"] == "FeatureCollection"
        assert len(geojson["features"]) > 0

    def test_features_have_required_properties(self, store, property_specs):
        sparql = sparql_for_instances(property_specs, "en", QueryParams(""))
        results = store.query(sparql)
        geojson = instances_to_geojson(results, property_specs)

        for feature in geojson["features"]:
            props = feature["properties"]
            assert "id" in props
            assert "label" in props
            assert "type" in props
            assert "typeIri" in props
            if props.get("is_region"):
                assert feature["geometry"] is None
                assert props.get("regionKey")
                continue
            assert feature["geometry"]["type"] == "Point"
            coords = feature["geometry"]["coordinates"]
            assert -180 <= coords[0] <= 180, f"Invalid longitude: {coords[0]}"
            assert -90 <= coords[1] <= 90, f"Invalid latitude: {coords[1]}"

    def test_regions_are_exactly_those_a_pin_refers_to(self, store, property_specs):
        referenced = store.query("""
            PREFIX compass: <http://example.org/ocean-org/ontology#>
            SELECT DISTINCT ?region WHERE { ?pin compass:countryArea ?region . }
        """)
        expected = {str(row["region"]).rsplit("#", 1)[-1] for row in referenced}

        sparql = sparql_for_instances(property_specs, "en", QueryParams(""))
        geojson = instances_to_geojson(store.query(sparql), property_specs)
        regions = [f for f in geojson["features"] if f["properties"].get("is_region")]

        assert expected, "the ontology records no pin-to-region link at all"
        assert {r["properties"]["regionKey"] for r in regions} == expected
        for region in regions:
            assert region["geometry"] is None
            assert region["properties"]["typeIri"].endswith("CountryArea")
