"""Result parser tests.

Unit tests for the SPARQL-result-to-GeoJSON conversion layer, plus
integration tests that verify the full round-trip from real SPARQL queries.
"""
import pytest
from starlette.datastructures import QueryParams

from app.result_parser import (
    extract_property,
    results_to_geojson,
    _parse_projects,
    _parse_species,
    _parse_special_properties,
)
from app.sparql_builder import build_entities_query


# ---------------------------------------------------------------------------
# Unit tests for _parse_projects
# ---------------------------------------------------------------------------

class TestParseProjects:
    def test_full_project_entry(self):
        raw = "MyProject|2020-01-01|2025-12-31|http://img.png|http://proj.org|http://iri/1"
        result = _parse_projects(raw)
        assert len(result) == 1
        assert result[0]["name"] == "MyProject"
        assert result[0]["startDate"] == "2020-01-01"
        assert result[0]["endDate"] == "2025-12-31"
        assert result[0]["imageUrl"] == "http://img.png"
        assert result[0]["projectUrl"] == "http://proj.org"
        assert result[0]["projectIri"] == "http://iri/1"

    def test_partial_project_entry(self):
        raw = "ProjectX|2020-01-01|||"
        result = _parse_projects(raw)
        assert len(result) == 1
        assert result[0]["name"] == "ProjectX"
        assert "endDate" not in result[0]

    def test_multiple_projects(self):
        raw = "ProjA|2020|||http://a||;;ProjB|2021|||http://b||"
        result = _parse_projects(raw)
        assert len(result) == 2
        assert result[0]["name"] == "ProjA"
        assert result[1]["name"] == "ProjB"

    def test_empty_string(self):
        assert _parse_projects("") == []

    def test_name_only(self):
        result = _parse_projects("JustAName")
        assert len(result) == 1
        assert result[0]["name"] == "JustAName"


class TestParseSpecies:
    def test_merges_project_and_self_species(self):
        res = {"speciesRaw": "Whale;;Dolphin", "selfSpeciesRaw": "Turtle;;Whale"}
        species = _parse_species(res)
        assert set(species) == {"Whale", "Dolphin", "Turtle"}
        # Whale appears once (deduped), order preserved
        assert species.index("Whale") < species.index("Dolphin")

    def test_empty_species(self):
        assert _parse_species({}) == []


class TestParseSpecialProperties:
    def test_extracts_network_fields(self):
        res = {
            "memberCountResult": "45",
            "memberStatesResult": "23",
            "mandateResult": "Ocean governance",
            "selfStart": "2010-01-01",
            "selfEnd": "",
            "selfImage": "http://img.png",
            "selfPUrl": "http://proj.org",
            "linkedProjectIris": "http://p1;;http://p2",
        }
        props = _parse_special_properties(res)
        assert props["memberCount"] == "45"
        assert props["memberStates"] == "23"
        assert props["mandate"] == "Ocean governance"
        assert props["projectIris"] == ["http://p1", "http://p2"]

    def test_missing_fields_default_empty(self):
        props = _parse_special_properties({})
        assert props["memberCount"] == ""
        assert props["projectIris"] == []


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

    def test_projects_field_populated(self, store, property_specs):
        """At least some entities should have populated projects lists."""
        sparql = build_entities_query(property_specs, "en", QueryParams(""))
        results = store.query(sparql)
        geojson = results_to_geojson(results, property_specs)

        has_projects = [
            f for f in geojson["features"]
            if f["properties"].get("projects")
        ]
        assert len(has_projects) > 0, "No entities have populated projects — check hasProject triples"

    def test_species_field_populated(self, store, property_specs):
        """At least some entities should have species."""
        sparql = build_entities_query(property_specs, "en", QueryParams(""))
        results = store.query(sparql)
        geojson = results_to_geojson(results, property_specs)

        has_species = [
            f for f in geojson["features"]
            if f["properties"].get("species")
        ]
        assert len(has_species) > 0, "No entities have species — check species triples"
