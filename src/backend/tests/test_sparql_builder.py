"""SPARQL builder tests: generated clauses, and queries run against the real ontology."""

import pytest
from rdflib.namespace import XSD
from starlette.datastructures import QueryParams

from app.namespaces import ALWAYS_ON_CLASSES, COMPASS, FILTERABLE_PIN_CLASSES
from app.shacl_to_entities import EntityShape
from app.sparql_builder import (
    _build_where_clauses,
    _pin_branch,
    build_facet_query,
    build_optional,
    build_select_expr,
    sparql_for_instances,
    to_prefixed,
)

_VALUE_FILTERS = {"species": "compass:species", "topic": "compass:topic"}


def _shape(**kwargs) -> EntityShape:
    defaults = {
        "path_iri": "http://example.org/x",
        "category": "simple_literal",
        "is_multi": False,
        "filter_type": "none",
        "datatype": None,
    }
    return EntityShape(**{**defaults, **kwargs})


def _clauses(query: str) -> list[str]:
    """Build the WHERE clauses for *query* against the two-tag filter map."""
    return _build_where_clauses(QueryParams(query), _VALUE_FILTERS, {}, {})


class TestToPrefixed:
    def test_known_namespace(self):
        assert to_prefixed(str(COMPASS.workArea)) == "compass:workArea"

    def test_unknown_namespace(self):
        assert to_prefixed("http://unknown.org/foo") == "<http://unknown.org/foo>"


class TestBuildOptional:
    def test_lang_literal(self):
        shape = _shape(
            id="location", path_iri=str(COMPASS.location), category="lang_literal"
        )
        result = build_optional(shape, "en")
        assert result.startswith("OPTIONAL")
        assert 'FILTER(lang(?location) = "en")' in result

    def test_iri_with_label(self):
        shape = _shape(
            id="workArea", path_iri=str(COMPASS.workArea), category="iri_with_label"
        )
        result = build_optional(shape, "en")
        assert "skos:prefLabel" in result
        assert "rdfs:label" in result

    def test_multi_folds_in_a_subquery(self):
        shape = _shape(
            id="workArea",
            path_iri=str(COMPASS.workArea),
            category="iri_with_label",
            is_multi=True,
        )
        result = build_optional(shape, "en")
        assert "SELECT ?s (GROUP_CONCAT(DISTINCT CONCAT(STR(?workAreaNode)" in result
        assert "AS ?workAreaAgg)" in result
        assert "GROUP BY ?s" in result

    def test_boolean(self):
        shape = _shape(id="someFlag", path_iri=str(COMPASS.someFlag), category="boolean")
        result = build_optional(shape, "en")
        assert "?s compass:someFlag ?someFlag ." in result
        assert "FILTER" not in result


class TestBuildSelectExpr:
    @pytest.mark.parametrize(
        ("category", "is_multi", "expected"),
        [
            ("iri_with_label", True, "(SAMPLE(?pAgg) AS ?pRaw)"),
            ("lang_literal", True, "(SAMPLE(?pAgg) AS ?pRaw)"),
            (
                "iri_with_label",
                False,
                "(SAMPLE(?pNode) AS ?pIri)\n           (SAMPLE(?pLab) AS ?pLabel)",
            ),
            ("simple_literal", False, "(SAMPLE(?p) AS ?pResult)"),
        ],
    )
    def test_projection(self, category, is_multi, expected):
        shape = _shape(id="p", category=category, is_multi=is_multi)
        assert build_select_expr(shape) == expected


class TestPinBranch:
    @pytest.mark.parametrize("entity_class", FILTERABLE_PIN_CLASSES)
    def test_branch_offers_class(self, entity_class):
        assert f"compass:{entity_class}" in _pin_branch([])

    @pytest.mark.parametrize("entity_class", ALWAYS_ON_CLASSES)
    def test_always_on_class_only_in_its_own_branch(self, entity_class):
        term = f"?s a compass:{entity_class} ."
        assert term not in _pin_branch([])
        assert _pin_branch([], with_always_on=True).count(term) == 1


class TestWhereClauses:
    def test_two_values_each_become_a_required_pattern(self):
        assert _clauses(f"species={COMPASS.Dolphins}&species={COMPASS.Whales}") == [
            f"?s compass:species <{COMPASS.Dolphins}> .",
            f"?s compass:species <{COMPASS.Whales}> .",
        ]

    def test_two_dimensions_each_constrain_the_pin(self):
        assert _clauses(f"species={COMPASS.Dolphins}&topic={COMPASS.Shipping}") == [
            f"?s compass:species <{COMPASS.Dolphins}> .",
            f"?s compass:topic <{COMPASS.Shipping}> .",
        ]

    def test_literal_values_get_one_variable_each(self):
        """One variable cannot equal two literals, so reuse would match nothing."""
        assert _clauses("topic=Shipping&topic=Hunting") == [
            '?s compass:topic ?topicVal0 . FILTER(str(?topicVal0) = "Shipping")',
            '?s compass:topic ?topicVal1 . FILTER(str(?topicVal1) = "Hunting")',
        ]

    def test_a_repeated_value_constrains_nothing_twice(self):
        assert _clauses(f"species={COMPASS.Whales}&species={COMPASS.Whales}") == [
            f"?s compass:species <{COMPASS.Whales}> ."
        ]

    def test_entity_type_values_combine_with_or(self):
        clauses = _build_where_clauses(
            QueryParams(f"entityType={COMPASS.Programme}&entityType={COMPASS.Network}"),
            {},
            {},
            {},
        )
        assert clauses == [f"FILTER(?type IN (<{COMPASS.Programme}>, <{COMPASS.Network}>))"]

    def test_range_and_date_thresholds(self):
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

    @pytest.mark.parametrize("value", ["soon", "inf", "nan"])
    def test_an_unusable_threshold_constrains_nothing(self, value):
        clauses = _build_where_clauses(
            QueryParams(f"year={value}&size={value}&start={value}"),
            {},
            {"year": ("compass:year", str(XSD.gYear)), "size": ("compass:size", None)},
            {"start": "compass:start"},
        )
        assert clauses == []


class TestFacetQuery:
    def test_a_tag_dimension_keeps_its_own_selection(self, entity_shapes):
        sparql = build_facet_query(
            entity_shapes, "en", QueryParams(f"species={COMPASS.Dolphins}"), "species"
        )
        assert f"?s compass:species <{COMPASS.Dolphins}> ." in sparql

    def test_entity_type_drops_its_own_selection(self, entity_shapes):
        sparql = build_facet_query(
            entity_shapes,
            "en",
            QueryParams(f"entityType={COMPASS.Programme}"),
            "entityType",
        )
        assert "FILTER(?type IN" not in sparql

    def test_other_dimensions_constrain_a_count(self, entity_shapes):
        sparql = build_facet_query(
            entity_shapes, "en", QueryParams(f"topic={COMPASS.Shipping}"), "species"
        )
        assert f"?s compass:topic <{COMPASS.Shipping}> ." in sparql


class TestEntitiesQuery:
    def test_filters_the_pin(self, entity_shapes):
        sparql = sparql_for_instances(
            entity_shapes, "en", QueryParams(f"countryArea={COMPASS.Greece}")
        )
        assert f"?s compass:countryArea <{COMPASS.Greece}> ." in sparql

    def test_entity_type_filters_the_bound_class(self):
        sparql = sparql_for_instances(
            [], "en", QueryParams(f"entityType={COMPASS.Network}")
        )
        assert f"FILTER(?type IN (<{COMPASS.Network}>))" in sparql

    def test_returns_every_named_entity_with_coordinates(self, store, entity_shapes):
        count_q = """
            PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
            PREFIX compass: <http://example.org/ocean-org/ontology#>
            SELECT (COUNT(DISTINCT ?s) AS ?count) WHERE {
                ?s geo:lat ?lat ; geo:long ?long .
                ?s compass:name ?n .
            }
        """
        expected = int(store.query(count_q)[0]["count"])
        assert expected > 0

        sparql = sparql_for_instances(entity_shapes, "en", QueryParams(""))
        results = store.query(sparql)
        assert len(results) >= expected, (
            f"Expected at least {expected} entities, got {len(results)}"
        )
