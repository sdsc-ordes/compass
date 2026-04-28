"""Ontology contract tests.

These tests verify that the RDF data satisfies the structural assumptions
hardcoded in sparql_builder.py, schema.py, and result_parser.py.

If any of these fail after an ontology edit, the corresponding backend code
will break silently (empty results, missing fields, etc.).
"""
import os

import pyshacl
from rdflib import RDF, RDFS, Graph, Namespace, URIRef, SH
from rdflib.namespace import SKOS, XSD

from app.namespaces import GEO, COMPASS

_ONTOLOGY_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "ontology",
)


# -- Top-level entity classes the SPARQL preamble UNION relies on --

class TestTopLevelEntityClasses:
    """The UNION in _sparql_preamble() requires exactly these 4 classes."""

    REQUIRED_CLASSES = [
        COMPASS.InternationalForum,
        COMPASS.Network,
        COMPASS.Project,
        COMPASS.PartnerOrganization,
    ]

    def test_classes_have_instances(self, rdflib_graph):
        """Each of the 4 entity types must have at least one instance in compass.ttl."""
        for cls in self.REQUIRED_CLASSES:
            subjects = list(rdflib_graph.subjects(RDF.type, cls))
            assert subjects, (
                f"{cls} has no instances in compass.ttl. "
                f"Add at least one instance or remove from _sparql_preamble()."
            )

    def test_entity_type_filter_classes_match_ontology(self, rdflib_graph):
        """schema.py _add_entity_type_filter() hardcodes a list of type classes.
        Verify every class in that list matches what the ontology declares."""
        from app.schema import _add_entity_type_filter

        dummy_filters = []
        _add_entity_type_filter(rdflib_graph, dummy_filters, "en")
        schema_type_iris = {opt["value"] for opt in dummy_filters[0]["options"]}

        expected = {str(cls) for cls in self.REQUIRED_CLASSES}
        assert expected <= schema_type_iris, (
            f"Entity classes missing from _add_entity_type_filter: {expected - schema_type_iris}"
        )


# -- Required predicates that the SPARQL preamble hardcodes --

class TestRequiredPredicates:
    """Predicates that _sparql_preamble() and _special_optionals() reference directly."""

    def test_geometry_predicates_in_data(self, rdflib_graph):
        lat_triples = list(rdflib_graph.triples((None, GEO.lat, None)))
        long_triples = list(rdflib_graph.triples((None, GEO.long, None)))
        assert lat_triples, "No geo:lat triples found — map will be empty"
        assert long_triples, "No geo:long triples found — map will be empty"

    def test_name_predicate_in_data(self, rdflib_graph):
        names = list(rdflib_graph.triples((None, COMPASS.name, None)))
        assert names, "No compass:name triples — all entities will be invisible on the map"


class TestSpecialOptionalPredicates:
    """Predicates referenced in _special_optionals() for type-specific fields."""

    def test_project_startdate_predicate_exists(self, rdflib_graph):
        projects = list(rdflib_graph.subjects(RDF.type, COMPASS.Project))
        if not projects:
            return
        triples = list(rdflib_graph.triples((None, COMPASS.startDate, None)))
        assert triples, (
            "No compass:startDate triples found. "
            "If renamed, update _special_optionals() and _parse_special_properties()."
        )


# -- Named property shapes drive schema.py (via entity NodeShapes) --

class TestNamedPropertyShapes:
    """schema.py reads named sh:Shape IRIs from entity NodeShapes (those with sh:targetClass).
    If entity NodeShapes lose their sh:property references, filters and SPARQL break."""

    def _entity_prop_paths(self, g):
        paths = set()
        for node_shape in g.subjects(SH.targetClass, None):
            for p in g.objects(node_shape, SH.property):
                if isinstance(p, URIRef):
                    path = g.value(p, SH.path)
                    if path is not None:
                        paths.add(path)
        return paths

    def test_entity_nodeshapes_have_named_properties(self, rdflib_graph):
        count = sum(
            1
            for node_shape in rdflib_graph.subjects(SH.targetClass, None)
            for p in rdflib_graph.objects(node_shape, SH.property)
            if isinstance(p, URIRef)
        )
        assert count > 0, (
            "No named sh:property IRIs found on entity NodeShapes — "
            "filters will be empty and SPARQL will have no OPTIONAL clauses."
        )

    def test_key_sentence_in_entity_shapes(self, rdflib_graph):
        paths = self._entity_prop_paths(rdflib_graph)
        assert COMPASS.keySentence in paths, (
            "compass:keySentence not found in any entity NodeShape property — "
            "key sentence field will be missing."
        )

    def test_founding_date_in_entity_shapes(self, rdflib_graph):
        from rdflib import URIRef
        founding_date = URIRef("https://schema.org/foundingDate")
        paths = self._entity_prop_paths(rdflib_graph)
        assert founding_date in paths, (
            "schema:foundingDate not found in any entity NodeShape property — "
            "founding year field will be missing."
        )


# -- Theme concepts exist and are properly typed --

class TestThemeVocabulary:
    """compass:publicTheme references require Theme instances to exist."""

    def test_theme_instances_exist(self, rdflib_graph):
        themes = list(rdflib_graph.subjects(RDF.type, COMPASS.Theme))
        assert len(themes) > 0, (
            "No compass:Theme instances found in vocab.ttl. "
            "publicTheme filter will have no options."
        )

    def test_theme_instances_have_prefLabel(self, rdflib_graph):
        for theme in rdflib_graph.subjects(RDF.type, COMPASS.Theme):
            labels = list(rdflib_graph.objects(theme, SKOS.prefLabel))
            assert labels, f"Theme {theme} has no skos:prefLabel"

    def test_theme_instances_have_isPublic(self, rdflib_graph):
        for theme in rdflib_graph.subjects(RDF.type, COMPASS.Theme):
            is_public = list(rdflib_graph.objects(theme, COMPASS.isPublic))
            assert is_public, f"Theme {theme} has no compass:isPublic property"


# -- FocusArea concepts exist and have story URLs --

class TestFocusAreaVocabulary:
    """compass:focusArea references require FocusArea instances with schema:url."""

    SCHEMA = Namespace("https://schema.org/")

    def test_focus_area_instances_exist(self, rdflib_graph):
        areas = list(rdflib_graph.subjects(RDF.type, COMPASS.FocusArea))
        assert len(areas) > 0, "No compass:FocusArea instances found."

    def test_focus_areas_have_story_url(self, rdflib_graph):
        missing = []
        for area in rdflib_graph.subjects(RDF.type, COMPASS.FocusArea):
            urls = list(rdflib_graph.objects(area, self.SCHEMA.url))
            if not urls:
                missing.append(str(area))
        assert not missing, (
            f"FocusArea concepts missing schema:url (story page): {missing}"
        )


# -- All geo-located entities have a compass:name --

class TestAllGeoEntitiesHaveLabels:
    """_sparql_preamble() does FILTER(BOUND(?label)) via compass:name.
    Entities without compass:name will be silently dropped from the map."""

    def test_geo_entities_have_name(self, rdflib_graph):
        missing = []
        for subj in rdflib_graph.subjects(GEO.lat, None):
            names = list(rdflib_graph.objects(subj, COMPASS.name))
            if not names:
                missing.append(str(subj))
        assert not missing, (
            f"Entities with geo:lat but no compass:name "
            f"(will be invisible on map): {missing}"
        )


# -- SHACL validation of instance data --

class TestShaclValidation:
    """Instance data in compass.ttl must conform to shapes.ttl.

    Add a new entity? If it violates a SHACL constraint (missing required
    property, wrong datatype, etc.) this test will fail and tell you exactly
    which node and constraint are broken.
    """

    def test_instance_data_conforms(self):
        shapes_graph = Graph()
        shapes_graph.parse(os.path.join(_ONTOLOGY_DIR, "shapes.ttl"), format="turtle")

        data_graph = Graph()
        data_graph.parse(os.path.join(_ONTOLOGY_DIR, "compass.ttl"), format="turtle")
        data_graph.parse(os.path.join(_ONTOLOGY_DIR, "vocab.ttl"), format="turtle")
        data_graph.parse(os.path.join(_ONTOLOGY_DIR, "shapes.ttl"), format="turtle")

        conforms, _, report_text = pyshacl.validate(
            data_graph,
            shacl_graph=shapes_graph,
            inference="rdfs",
            abort_on_first=False,
        )
        assert conforms, f"SHACL validation failed:\n{report_text}"
