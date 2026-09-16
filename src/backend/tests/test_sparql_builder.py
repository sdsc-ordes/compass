"""SPARQL builder tests.

Tests that the generated SPARQL is structurally valid and that the base query
actually returns all expected entities from the real ontology.
"""

import pytest
from rdflib.namespace import XSD
from starlette.datastructures import QueryParams

from app.namespaces import COMPASS
from app.shacl_to_entities import EntityShape
from app.sparql_builder import (
    PIN,
    PIN_CLASSES,
    REGION_PIN,
    _build_where_clauses,
    _pin_branch,
    _region_branch,
    _shared_optionals,
    build_facet_query,
    build_optional,
    build_select_expr,
    sparql_for_instances,
    to_prefixed,
)

# A tag dimension backed by a real predicate, for the clause-level tests.
_FILTER_MAP = {"species": "compass:species", "topic": "compass:topic"}


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


class TestToPrefixed:
    def test_known_namespace(self):
        assert to_prefixed(str(COMPASS.workArea)) == "compass:workArea"

    def test_unknown_namespace(self):
        assert to_prefixed("http://unknown.org/foo") == "<http://unknown.org/foo>"


class TestBuildOptional:
    def test_lang_literal(self):
        spec = _ep(
            id="location",
            path_iri=str(COMPASS.location),
            category="lang_literal",
        )
        result = build_optional(spec, "en")
        assert 'FILTER(lang(?location) = "en")' in result
        assert "OPTIONAL" in result

    def test_iri_with_label(self):
        spec = _ep(
            id="workArea",
            path_iri=str(COMPASS.workArea),
            category="iri_with_label",
        )
        result = build_optional(spec, "en")
        assert "skos:prefLabel" in result
        assert "rdfs:label" in result

    def test_boolean(self):
        spec = _ep(
            id="managedByOceanCare",
            path_iri=str(COMPASS.managedByOceanCare),
            category="boolean",
        )
        result = build_optional(spec, "en")
        assert "OPTIONAL" in result
        assert "FILTER" not in result


class TestBuildSelectExpr:
    def test_multi_iri(self):
        spec = _ep(id="workArea", category="iri_with_label", is_multi=True)
        result = build_select_expr(spec)
        assert "GROUP_CONCAT" in result
        assert "workAreaNode" in result

    def test_single_iri(self):
        spec = _ep(id="funding", category="iri_with_label", is_multi=False)
        result = build_select_expr(spec)
        assert "SAMPLE" in result

    def test_multi_literal(self):
        spec = _ep(id="country", category="lang_literal", is_multi=True)
        result = build_select_expr(spec)
        assert "GROUP_CONCAT" in result

    def test_single_literal(self):
        spec = _ep(id="staffSize", category="simple_literal", is_multi=False)
        result = build_select_expr(spec)
        assert "SAMPLE" in result


class TestPinBranch:
    """The pin branch must offer every class that can carry coordinates."""

    @pytest.mark.parametrize("entity_class", PIN_CLASSES)
    def test_branch_offers_class(self, entity_class):
        assert f"compass:{entity_class}" in _pin_branch([])

    def test_branch_excludes_regions(self):
        """Regions are derived, so they must never be a pin alternative."""
        assert "compass:CountryArea" not in _pin_branch([])

    def test_shared_optionals_bind_geometry_and_name(self):
        optionals = _shared_optionals("en")
        assert "geo:lat" in optionals
        assert "geo:long" in optionals
        assert "compass:name" in optionals


class TestRegionBranch:
    """A region reaches the map only through a pin that points at it."""

    def test_requires_a_referring_pin(self):
        branch = _region_branch([])
        assert "FILTER EXISTS" in branch
        assert "?pin compass:countryArea ?s ." in branch

    def test_filters_apply_to_the_referring_pin(self):
        """A region carries no tags, so the filters must constrain the pin."""
        branch = _region_branch(["?pin compass:topic compass:Shipping ."])
        assert "?pin compass:topic compass:Shipping ." in branch
        assert "?s compass:topic" not in branch


def _clauses(query: str, subject=PIN) -> list[str]:
    """Filter clauses for a query string, against a two-tag filter map."""
    return _build_where_clauses(QueryParams(query), _FILTER_MAP, {}, {}, subject=subject)


class TestWithinDimensionIsConjunctive:
    """Two picks in one dimension mean "both", not "either"."""

    def test_two_values_each_become_a_required_pattern(self):
        clauses = _clauses(f"species={COMPASS.Dolphins}&species={COMPASS.Whales}")
        assert clauses == [
            f"?s compass:species <{COMPASS.Dolphins}> .",
            f"?s compass:species <{COMPASS.Whales}> .",
        ]
        assert not any("UNION" in c for c in clauses)

    def test_a_single_value_is_unchanged(self):
        assert _clauses(f"species={COMPASS.Dolphins}") == [
            f"?s compass:species <{COMPASS.Dolphins}> ."
        ]

    def test_two_dimensions_still_and(self):
        clauses = _clauses(f"species={COMPASS.Dolphins}&topic={COMPASS.Shipping}")
        assert clauses == [
            f"?s compass:species <{COMPASS.Dolphins}> .",
            f"?s compass:topic <{COMPASS.Shipping}> .",
        ]

    def test_literal_values_get_one_variable_each(self):
        """One variable cannot equal two literals, so reuse would match nothing."""
        clauses = _clauses("topic=Shipping&topic=Hunting")
        assert clauses == [
            '?s compass:topic ?topicVal0 . FILTER(str(?topicVal0) = "Shipping")',
            '?s compass:topic ?topicVal1 . FILTER(str(?topicVal1) = "Hunting")',
        ]

    def test_literal_variables_stay_distinct_in_the_region_copy(self):
        clauses = _clauses("topic=Shipping&topic=Hunting", subject=REGION_PIN)
        assert clauses == [
            '?pin compass:topic ?topicPinVal0 . FILTER(str(?topicPinVal0) = "Shipping")',
            '?pin compass:topic ?topicPinVal1 . FILTER(str(?topicPinVal1) = "Hunting")',
        ]

    def test_a_repeated_value_constrains_nothing_twice(self):
        assert _clauses(f"species={COMPASS.Whales}&species={COMPASS.Whales}") == [
            f"?s compass:species <{COMPASS.Whales}> ."
        ]

    def test_entity_type_stays_disjunctive(self):
        """An entity has exactly one class, so two picks can only mean "either"."""
        clauses = _build_where_clauses(
            QueryParams(f"entityType={COMPASS.Project}&entityType={COMPASS.Network}"),
            {},
            {},
            {},
        )
        assert clauses == [f"FILTER(?type IN (<{COMPASS.Project}>, <{COMPASS.Network}>))"]

    def test_range_and_date_are_single_valued_and_untouched(self):
        """Thresholds take one value, so conjunction within them cannot arise."""
        clauses = _build_where_clauses(
            QueryParams("year=1990&start=2020-01-01"),
            {},
            {"year": ("compass:year", str(XSD.gYear))},
            {"start": "compass:start"},
        )
        assert clauses == [
            "OPTIONAL { ?s compass:year ?yearVal . } "
            'FILTER(!BOUND(?yearVal) || ?yearVal >= "1990"^^xsd:gYear)',
            "OPTIONAL { ?s compass:start ?startVal . } "
            'FILTER(!BOUND(?startVal) || ?startVal >= "2020-01-01"^^xsd:date)',
        ]


class TestConjunctionAgainstTheStore:
    """The intersection claim, checked against the real ontology."""

    def _pins(self, store, property_specs, query: str) -> set[str]:
        sparql = sparql_for_instances(property_specs, "en", QueryParams(query))
        return {
            row["s"]
            for row in store.query(sparql)
            if row["type"] != str(COMPASS.CountryArea)
        }

    def test_two_values_return_the_intersection(self, store, property_specs):
        both_tags = f"species={COMPASS.Dolphins}&species={COMPASS.Whales}"
        dolphins = self._pins(store, property_specs, f"species={COMPASS.Dolphins}")
        whales = self._pins(store, property_specs, f"species={COMPASS.Whales}")
        both = self._pins(store, property_specs, both_tags)

        assert both, "the fixture must hold entities carrying both tags"
        assert both == dolphins & whales
        assert both < dolphins and both < whales, "AND must narrow, not widen"

    def test_regions_narrow_with_their_pins(self, store, property_specs):
        """A region is shaded by one pin passing every filter, not by two."""

        def regions(query: str) -> set[str]:
            sparql = sparql_for_instances(property_specs, "en", QueryParams(query))
            return {
                row["s"]
                for row in store.query(sparql)
                if row["type"] == str(COMPASS.CountryArea)
            }

        dolphins = regions(f"species={COMPASS.Dolphins}")
        whales = regions(f"species={COMPASS.Whales}")
        both = regions(f"species={COMPASS.Dolphins}&species={COMPASS.Whales}")
        assert both, "some region holds a pin carrying both tags"
        assert both <= dolphins and both <= whales


class TestFacetQueryUnderAnd:
    """A facet count means "results if I also pick this"."""

    def test_a_conjunctive_dimension_keeps_its_own_selection(self, property_specs):
        sparql = build_facet_query(
            property_specs, "en", QueryParams(f"species={COMPASS.Dolphins}"), "species"
        )
        assert f"?s compass:species <{COMPASS.Dolphins}> ." in sparql

    def test_entity_type_still_drops_its_own_selection(self, property_specs):
        """Disjunctive, so keeping it would zero every class the user did not pick."""
        sparql = build_facet_query(
            property_specs, "en", QueryParams(f"entityType={COMPASS.Project}"), "entityType"
        )
        assert "FILTER(?type IN" not in sparql

    def test_other_dimensions_still_constrain_a_count(self, property_specs):
        sparql = build_facet_query(
            property_specs, "en", QueryParams(f"topic={COMPASS.Shipping}"), "species"
        )
        assert f"?s compass:topic <{COMPASS.Shipping}> ." in sparql

    def test_a_count_is_what_picking_that_value_would_return(self, store, property_specs):
        """The sibling count under one pick equals the two-pick result count."""
        facets = build_facet_query(
            property_specs, "en", QueryParams(f"species={COMPASS.Dolphins}"), "species"
        )
        counts = {row["val"]: int(row["n"]) for row in store.query(facets)}

        entities = sparql_for_instances(
            property_specs,
            "en",
            QueryParams(f"species={COMPASS.Dolphins}&species={COMPASS.Whales}"),
        )
        pins = [
            row for row in store.query(entities) if row["type"] != str(COMPASS.CountryArea)
        ]
        assert counts[str(COMPASS.Whales)] == len(pins)


class TestFilterSubjects:
    """Both copies of a filter must constrain their own subject."""

    def test_entities_query_filters_pins_and_referring_pins(self, property_specs):
        sparql = sparql_for_instances(
            property_specs, "en", QueryParams(f"countryArea={COMPASS.Greece}")
        )
        assert f"?s compass:countryArea <{COMPASS.Greece}> ." in sparql
        assert f"?pin compass:countryArea <{COMPASS.Greece}> ." in sparql

    def test_entity_type_reaches_regions_through_their_pins(self):
        sparql = sparql_for_instances(
            [], "en", QueryParams(f"entityType={COMPASS.Project}")
        )
        assert f"FILTER(?type IN (<{COMPASS.Project}>))" in sparql
        assert f"?pin a ?pinType . FILTER(?pinType IN (<{COMPASS.Project}>))" in sparql

    def test_facet_query_counts_pins_only(self, property_specs):
        sparql = build_facet_query(property_specs, "en", QueryParams(""), "topic")
        assert "compass:CountryArea" not in sparql


class TestBuildEntitiesQueryExecutes:
    """Integration: the generated query must actually execute and return results."""

    def test_base_query_returns_results(self, store, property_specs):
        sparql = sparql_for_instances(property_specs, "en", QueryParams(""))
        results = store.query(sparql)
        assert len(results) > 0, "Base entities query returned no results"

    def test_all_geo_entities_returned(self, store, property_specs):
        """Every entity with lat/long and a compass:name should appear."""
        # Count entities that have coordinates and a name
        count_q = """
            PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
            PREFIX compass: <http://example.org/ocean-org/ontology#>
            SELECT (COUNT(DISTINCT ?s) AS ?count) WHERE {
                ?s geo:lat ?lat ; geo:long ?long .
                ?s compass:name ?n .
            }
        """
        count_result = store.query(count_q)
        expected = int(count_result[0]["count"])

        sparql = sparql_for_instances(property_specs, "en", QueryParams(""))
        results = store.query(sparql)
        assert len(results) >= expected, (
            f"Expected at least {expected} entities, got {len(results)}. "
            f"Some entities are being silently dropped."
        )

    def test_entity_type_filter(self, store, property_specs):
        """Filtering by entityType should narrow results."""
        all_results = store.query(
            sparql_for_instances(property_specs, "en", QueryParams(""))
        )
        filtered = store.query(
            sparql_for_instances(
                property_specs,
                "en",
                QueryParams(f"entityType={COMPASS.InternationalForum}"),
            )
        )
        assert len(filtered) > 0, "entityType filter returned no results"
        assert len(filtered) <= len(all_results)

    def test_german_language(self, store, property_specs):
        """de language should also return results."""
        results = store.query(
            sparql_for_instances(property_specs, "de", QueryParams("lang=de"))
        )
        assert len(results) > 0, "German language query returned no results"
