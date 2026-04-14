"""SPARQL builder tests.

Tests that the generated SPARQL is structurally valid and that the base query
actually returns all expected entities from the real ontology.
"""
from starlette.datastructures import QueryParams

from app.sparql_builder import (
    build_entities_query,
    build_optional,
    build_select_expr,
    to_prefixed,
    _sparql_preamble,
)
from app.namespaces import OCORG


class TestToPrefixed:
    def test_known_namespace(self):
        assert to_prefixed(str(OCORG.country)) == "ocorg:country"

    def test_unknown_namespace(self):
        assert to_prefixed("http://unknown.org/foo") == "<http://unknown.org/foo>"


class TestBuildOptional:
    def test_lang_literal(self):
        spec = {"id": "country", "path_iri": str(OCORG.country), "category": "lang_literal"}
        result = build_optional(spec, "en")
        assert 'FILTER(lang(?country) = "en")' in result
        assert "OPTIONAL" in result

    def test_iri_with_label(self):
        spec = {"id": "focusArea", "path_iri": str(OCORG.focusArea), "category": "iri_with_label"}
        result = build_optional(spec, "en")
        assert "skos:prefLabel" in result
        assert "rdfs:label" in result

    def test_boolean(self):
        spec = {"id": "offersTrips", "path_iri": str(OCORG.offersResearchTrips), "category": "boolean"}
        result = build_optional(spec, "en")
        assert "OPTIONAL" in result
        assert "FILTER" not in result


class TestBuildSelectExpr:
    def test_multi_iri(self):
        spec = {"id": "focusArea", "category": "iri_with_label", "is_multi": True}
        result = build_select_expr(spec)
        assert "GROUP_CONCAT" in result
        assert "focusAreaNode" in result

    def test_single_iri(self):
        spec = {"id": "funding", "category": "iri_with_label", "is_multi": False}
        result = build_select_expr(spec)
        assert "SAMPLE" in result

    def test_multi_literal(self):
        spec = {"id": "country", "category": "lang_literal", "is_multi": True}
        result = build_select_expr(spec)
        assert "GROUP_CONCAT" in result

    def test_single_literal(self):
        spec = {"id": "staffSize", "category": "simple_literal", "is_multi": False}
        result = build_select_expr(spec)
        assert "SAMPLE" in result


class TestSparqlPreamble:
    """The preamble UNION must reference the same classes as the ontology contract."""

    def test_preamble_contains_organization_subclass_query(self):
        preamble = _sparql_preamble("en")
        assert "rdfs:subClassOf* ocorg:Organization" in preamble

    def test_preamble_contains_network(self):
        assert "ocorg:Network" in _sparql_preamble("en")

    def test_preamble_contains_forum(self):
        assert "ocorg:InternationalForum" in _sparql_preamble("en")

    def test_preamble_contains_project(self):
        assert "ocorg:Project" in _sparql_preamble("en")

    def test_preamble_geo_bindings(self):
        preamble = _sparql_preamble("en")
        assert "geo:lat" in preamble
        assert "geo:long" in preamble

    def test_preamble_name_bindings(self):
        preamble = _sparql_preamble("en")
        assert "ocorg:organizationName" in preamble
        assert "ocorg:projectName" in preamble


class TestBuildEntitiesQueryExecutes:
    """Integration: the generated query must actually execute and return results."""

    def test_base_query_returns_results(self, store, property_specs):
        sparql = build_entities_query(property_specs, "en", QueryParams(""))
        results = store.query(sparql)
        assert len(results) > 0, "Base entities query returned no results"

    def test_all_geo_entities_returned(self, store, property_specs):
        """Every entity with lat/long and a label should appear."""
        # Count entities that have coordinates via a simple query
        count_q = """
            PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
            PREFIX ocorg: <http://example.org/ocean-org/ontology#>
            SELECT (COUNT(DISTINCT ?s) AS ?count) WHERE {
                ?s geo:lat ?lat ; geo:long ?long .
                { ?s ocorg:organizationName ?n } UNION { ?s ocorg:projectName ?n }
            }
        """
        count_result = store.query(count_q)
        expected = int(count_result[0]["count"])

        sparql = build_entities_query(property_specs, "en", QueryParams(""))
        results = store.query(sparql)
        assert len(results) >= expected, (
            f"Expected at least {expected} entities, got {len(results)}. "
            f"Some entities are being silently dropped."
        )

    def test_entity_type_filter(self, store, property_specs):
        """Filtering by entityType should narrow results."""
        all_results = store.query(
            build_entities_query(property_specs, "en", QueryParams(""))
        )
        filtered = store.query(
            build_entities_query(
                property_specs, "en",
                QueryParams(f"entityType={OCORG.ResearchInstitute}")
            )
        )
        assert len(filtered) > 0, "entityType filter returned no results"
        assert len(filtered) <= len(all_results)

    def test_german_language(self, store, property_specs):
        """de language should also return results."""
        results = store.query(
            build_entities_query(property_specs, "de", QueryParams("lang=de"))
        )
        assert len(results) > 0, "German language query returned no results"
