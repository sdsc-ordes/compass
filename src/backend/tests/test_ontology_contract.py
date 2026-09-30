"""Ontology contract tests.

The query layer assumes a shape of the RDF data that SHACL alone does not
enforce; an ontology edit that breaks it fails here instead of emptying the map.
"""

from typing import ClassVar

import pyshacl
from rdflib import RDF, RDFS, SH, Graph
from rdflib.namespace import SKOS

from app.core.settings import settings
from app.namespaces import COMPASS, GEO, PIN_CLASSES
from app.shacl_to_entities import map_property_shapes, targets_map_entity
from app.shacl_to_filters import get_filters_from_shacl

_SHAPES = settings.ontology_dir / "shapes.ttl"
_SHACL_SHACL = settings.ontology_dir / "shacl-shacl.ttl"


def _projected_paths(graph: Graph) -> set:
    return {graph.value(p, SH.path) for p in map_property_shapes(graph)}


def test_every_pin_class_has_instances(graph):
    for cls in (COMPASS[name] for name in PIN_CLASSES):
        assert list(graph.subjects(RDF.type, cls)), f"{cls} has no instances"


def test_geometry_predicates_in_data(graph):
    assert list(graph.triples((None, GEO.lat, None))), "No geo:lat triples"
    assert list(graph.triples((None, GEO.long, None))), "No geo:long triples"


def test_geo_entities_have_name(graph):
    """The pin query requires compass:name, so an unnamed entity never shows."""
    missing = [
        str(subject)
        for subject in graph.subjects(GEO.lat, None)
        if not list(graph.objects(subject, COMPASS.name))
    ]
    assert not missing, f"Entities with geo:lat but no compass:name: {missing}"


def test_description_in_entity_shapes(graph):
    assert COMPASS.description in _projected_paths(graph), (
        "compass:description is not projected; the sidebar would lose it"
    )


class TestValidationOnlyShapes:
    """Only NodeShapes targeting a compass:MapEntity subclass reach the map.

    compass:ConceptShape and compass:ConceptSchemeShape only validate the
    generated vocabulary Turtle.
    """

    VOCABULARY_PATHS: ClassVar[list] = [
        SKOS.inScheme,
        SKOS.topConceptOf,
        SKOS.hasTopConcept,
        SKOS.definition,
        COMPASS.wpTagId,
    ]

    EXPECTED_WIDGET_IDS: ClassVar[set] = {
        "countryArea",
        "entityType",
        "forum",
        "programme",
        "species",
        "topic",
        "workArea",
    }

    def test_entity_shapes_are_closed(self, graph):
        """A typo'd predicate in compass.ttl must fail validation, not vanish."""
        unclosed = [
            str(shape)
            for shape in graph.subjects(SH.targetClass, None)
            if targets_map_entity(graph, shape) and graph.value(shape, SH.closed) is None
        ]
        assert not unclosed, f"Entity NodeShapes missing sh:closed: {unclosed}"

    def test_vocabulary_predicates_are_not_projected(self, graph):
        projected = _projected_paths(graph)
        leaked = [str(path) for path in self.VOCABULARY_PATHS if path in projected]
        assert not leaked, f"Vocabulary predicates reached the map projection: {leaked}"

    def test_filter_widgets_are_pinned(self, graph):
        ids = {widget.id for widget in get_filters_from_shacl(graph, "en")}
        assert ids == self.EXPECTED_WIDGET_IDS, (
            f"Filter panel changed: added {sorted(ids - self.EXPECTED_WIDGET_IDS)}, "
            f"removed {sorted(self.EXPECTED_WIDGET_IDS - ids)}"
        )


class TestTagVocabularies:
    """SHACL cannot express "this class has at least one instance"."""

    TAG_CLASSES: ClassVar[list] = [
        COMPASS.WorkArea,
        COMPASS.Topic,
        COMPASS.Programme,
        COMPASS.Species,
        COMPASS.CountryArea,
    ]

    def test_concepts_have_exactly_one_dimension_class(self, graph):
        """A filter finds its options by class: none hides a concept, two duplicate it."""
        tag_classes = set(self.TAG_CLASSES)
        wrong = {
            str(concept): sorted(str(c) for c in tag_classes & types)
            for concept in graph.subjects(RDF.type, SKOS.Concept)
            if len(tag_classes & (types := set(graph.objects(concept, RDF.type)))) != 1
        }
        assert not wrong, f"Concepts without exactly one dimension class: {wrong}"

    def test_tag_classes_have_instances(self, graph):
        for cls in self.TAG_CLASSES:
            assert list(graph.subjects(RDF.type, cls)), f"No instances of {cls}"


def test_forums_have_rdfs_label(graph):
    """Forums are tag values through compass:forum and are labelled by rdfs:label."""
    missing = [
        str(forum)
        for forum in graph.subjects(RDF.type, COMPASS.InternationalForum)
        if not list(graph.objects(forum, RDFS.label))
    ]
    assert not missing, f"InternationalForum entities missing rdfs:label: {missing}"


class TestShaclValidation:
    def test_instance_data_conforms(self):
        shapes_graph = Graph().parse(_SHAPES, format="turtle")

        data_graph = Graph()
        data_graph.parse(settings.use_case_dir / "compass.ttl", format="turtle")
        data_graph.parse(settings.use_case_dir / "vocab.ttl", format="turtle")
        data_graph.parse(_SHAPES, format="turtle")

        conforms, _, report_text = pyshacl.validate(
            data_graph,
            shacl_graph=shapes_graph,
            inference="rdfs",
            abort_on_first=False,
        )
        assert conforms, f"SHACL validation failed:\n{report_text}"

    def test_shapes_conform_to_the_meta_shapes(self):
        """Validate shapes.ttl against shacl-shacl.ttl.

        No RDFS entailment: it would type every predicate as rdf:Property and
        then demand labels for rdf:type, rdfs:label and the sh: vocabulary.
        """
        conforms, _, report_text = pyshacl.validate(
            Graph().parse(_SHAPES, format="turtle"),
            shacl_graph=Graph().parse(_SHACL_SHACL, format="turtle"),
            inference="none",
            abort_on_first=False,
        )
        assert conforms, f"shapes.ttl violates shacl-shacl.ttl:\n{report_text}"
