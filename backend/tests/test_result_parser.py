"""Result parser tests.

Unit tests for the SPARQL-result-to-GeoJSON conversion layer, plus
integration tests that verify the full round-trip from real SPARQL queries.
"""
import pytest
from starlette.datastructures import QueryParams

from app.result_parser import (
    extract_property,
    results_to_geojson,
    _parse_special_properties,
)
from app.sparql_builder import build_entities_query


class TestParseSpecialProperties:
    def test_extracts_network_fields(self):
        res = {
            "memberCountResult": "45",
            "memberStatesResult": "23",
            "mandateResult": "Ocean governance",
            "selfStart": "2010-01-01",
            "selfEnd": "",
        }
        props = _parse_special_properties(res)
        assert props["memberCount"] == "45"
        assert props["memberStates"] == "23"
        assert props["mandate"] == "Ocean governance"
        assert props["startDate"] == "2010-01-01"
        assert props["endDate"] == ""

    def test_missing_fields_default_empty(self):
        props = _parse_special_properties({})
        assert props["memberCount"] == ""
        assert props["mandate"] == ""


class TestExtractProperty:
    def test_multi_iri_with_label(self):
        spec = {"id": "focusArea", "category": "iri_with_label", "is_multi": True}
        res = {"focusAreaRaw": "http://ex.org/A|LabelA;;http://ex.org/B|LabelB"}
        result = extract_property(spec, res)
        assert len(result) == 2
        assert result[0] == {"iri": "http://ex.org/A", "label": "LabelA"}

    def test_single_iri_with_label(self):
        spec = {"id": "funding", "category": "iri_with_label", "is_multi": False}
        res = {"fundingIri": "http://ex.org/public", "fundingLabel": "Public"}
        result = extract_property(spec, res)
        assert result == {"iri": "http://ex.org/public", "label": "Public"}

    def test_boolean(self):
        spec = {"id": "active", "category": "boolean", "is_multi": False}
        assert extract_property(spec, {"activeResult": "true"}) is True
        assert extract_property(spec, {"activeResult": "false"}) is False

    def test_multi_literal(self):
        spec = {"id": "activities", "category": "lang_literal", "is_multi": True}
        res = {"activitiesRaw": "Research;;Education;;Policy"}
        result = extract_property(spec, res)
        assert result == ["Research", "Education", "Policy"]



# ---------------------------------------------------------------------------
# Integration: full round-trip
# ---------------------------------------------------------------------------

class TestResultsToGeojsonIntegration:
    def test_round_trip_produces_features(self, store, property_specs):
        sparql = build_entities_query(property_specs, "en", QueryParams(""))
        results = store.query(sparql)
        geojson = results_to_geojson(results, property_specs)
        assert geojson["type"] == "FeatureCollection"
        assert len(geojson["features"]) > 0

    def test_features_have_required_properties(self, store, property_specs):
        sparql = build_entities_query(property_specs, "en", QueryParams(""))
        results = store.query(sparql)
        geojson = results_to_geojson(results, property_specs)

        for feature in geojson["features"]:
            props = feature["properties"]
            assert "id" in props
            assert "label" in props
            assert "type" in props
            assert "typeIri" in props
            assert feature["geometry"]["type"] == "Point"
            coords = feature["geometry"]["coordinates"]
            assert -180 <= coords[0] <= 180, f"Invalid longitude: {coords[0]}"
            assert -90 <= coords[1] <= 90, f"Invalid latitude: {coords[1]}"
