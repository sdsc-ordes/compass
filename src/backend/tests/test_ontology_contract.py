"""Ontology contract tests.

These tests verify that the RDF data satisfies the structural assumptions
hardcoded in sparql_builder.py, shacl_to_filters.py, and
sparql_to_geojson_translator.py.

If any of these fail after an ontology edit, the corresponding backend code
will break silently (empty results, missing fields, etc.).
"""

import os
from typing import ClassVar

import pyshacl
from rdflib import RDF, RDFS, SH, Graph, URIRef
from rdflib.namespace import SKOS

from app.core.settings import settings
from app.namespaces import (
    ALWAYS_ON_CLASSES,
    COMPASS,
    FILTERABLE_PIN_CLASSES,
    GEO,
    PIN_CLASSES,
)
from app.shacl_to_entities import get_shacl_property, targets_map_entity
from app.shacl_to_filters import _entity_type_dimension, get_filters_from_shacl

_ONTOLOGY_DIR = str(settings.ontology_dir)
_USECASE_DIR = str(settings.use_case_dir)
_SHAPES = os.path.join(_ONTOLOGY_DIR, "shapes.ttl")
_SHACL_SHACL = os.path.join(_ONTOLOGY_DIR, "shacl-shacl.ttl")


# -- Top-level entity classes the SPARQL preamble UNION relies on --


class TestTopLevelEntityClasses:
    """The UNION in _pin_branch() requires every one of these classes."""

    REQUIRED_CLASSES: ClassVar[list] = [
        COMPASS[name] for name in (*PIN_CLASSES, *ALWAYS_ON_CLASSES)
    ]

    def test_classes_have_instances(self, read_graph):
        """Each entity class must have at least one instance in compass.ttl."""
        for cls in self.REQUIRED_CLASSES:
            subjects = list(read_graph.subjects(RDF.type, cls))
            assert subjects, (
                f"{cls} has no instances in compass.ttl. "
                f"Add at least one instance or remove it from _pin_branch()."
            )

    def test_entity_type_offers_every_filterable_class(self, read_graph):
        """The entity-type dimension offers each filterable class, and only those.

        ALWAYS_ON_CLASSES stays out: its pins ignore the filters, so an option
        selecting on their class would promise a narrowing it cannot deliver.
        """
        widget = _entity_type_dimension(read_graph, "en")
        offered = {opt.value for opt in widget.options}

        assert offered == {str(COMPASS[name]) for name in FILTERABLE_PIN_CLASSES}
        assert offered.isdisjoint({str(COMPASS[name]) for name in ALWAYS_ON_CLASSES})


# -- Required predicates that the SPARQL preamble hardcodes --


class TestRequiredPredicates:
    """Predicates that _sparql_preamble() references directly."""

    def test_geometry_predicates_in_data(self, read_graph):
        lat_triples = list(read_graph.triples((None, GEO.lat, None)))
        long_triples = list(read_graph.triples((None, GEO.long, None)))
        assert lat_triples, "No geo:lat triples found — map will be empty"
        assert long_triples, "No geo:long triples found — map will be empty"

    def test_name_predicate_in_data(self, read_graph):
        names = list(read_graph.triples((None, COMPASS.name, None)))
        assert names, "No compass:name triples — all entities will be invisible on the map"


# -- Named property shapes drive shacl_to_entities / filter widgets --


class TestNamedPropertyShapes:
    """shacl_to_entities reads named sh:Shape IRIs from entity NodeShapes -- those with a
    sh:targetClass. Lose their sh:property references and filters and SPARQL break."""

    def _entity_prop_paths(self, g):
        paths = set()
        for node_shape in g.subjects(SH.targetClass, None):
            for p in g.objects(node_shape, SH.property):
                if isinstance(p, URIRef):
                    path = g.value(p, SH.path)
                    if path is not None:
                        paths.add(path)
        return paths

    def test_entity_nodeshapes_have_named_properties(self, read_graph):
        count = sum(
            1
            for node_shape in read_graph.subjects(SH.targetClass, None)
            for p in read_graph.objects(node_shape, SH.property)
            if isinstance(p, URIRef)
        )
        assert count > 0, (
            "No named sh:property IRIs found on entity NodeShapes — "
            "filters will be empty and SPARQL will have no OPTIONAL clauses."
        )

    def test_description_in_entity_shapes(self, read_graph):
        paths = self._entity_prop_paths(read_graph)
        assert COMPASS.description in paths, (
            "compass:description not found in any entity NodeShape property — "
            "the sidebar description paragraph will be missing."
        )


# -- Validation-only shapes stay out of the map projection --


class TestValidationOnlyShapes:
    """shapes.ttl holds two kinds of NodeShape and only one reaches the map.

    Shapes targeting a compass:MapEntity subclass drive the filter panel and the
    SPARQL projection. compass:ConceptShape and compass:ConceptSchemeShape check
    the Turtle the ODS generator emits and must contribute nothing to either --
    a leaked one puts a bookkeeping predicate like skos:inScheme in the filter
    panel and adds a dead OPTIONAL to every entity query.
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

    def test_entity_shapes_are_closed(self, read_graph):
        """Every entity NodeShape is sh:closed, so a typo'd predicate in
        compass.ttl fails validation instead of silently vanishing from the map."""
        unclosed = [
            str(shape)
            for shape in read_graph.subjects(SH.targetClass, None)
            if targets_map_entity(read_graph, shape)
            and read_graph.value(shape, SH.closed) is None
        ]
        assert not unclosed, f"Entity NodeShapes missing sh:closed: {unclosed}"

    def test_vocabulary_predicates_are_not_projected(self, read_graph):
        projected = {read_graph.value(p, SH.path) for p in get_shacl_property(read_graph)}
        leaked = [str(path) for path in self.VOCABULARY_PATHS if path in projected]
        assert not leaked, (
            f"Vocabulary predicates reached the map projection: {leaked}. "
            f"Only NodeShapes targeting a compass:MapEntity subclass may carry "
            f"sh:property shapes that shacl_to_entities projects."
        )

    def test_filter_widgets_are_pinned(self, read_graph):
        ids = {widget.id for widget in get_filters_from_shacl(read_graph, "en")}
        assert ids == self.EXPECTED_WIDGET_IDS, (
            f"Filter panel changed: added {sorted(ids - self.EXPECTED_WIDGET_IDS)}, "
            f"removed {sorted(self.EXPECTED_WIDGET_IDS - ids)}. Update this test "
            f"only if the change is intended."
        )


# -- Tag dimension vocabularies exist and have labels --


class TestTagVocabularies:
    """All 5 SKOS-based tag dimension classes must have instances.

    Label and metadata correctness is enforced by compass:ConceptShape in
    shapes.ttl; SHACL cannot express "this class has at least one instance".
    """

    TAG_CLASSES: ClassVar[list] = [
        COMPASS.WorkArea,
        COMPASS.Topic,
        COMPASS.Programme,
        COMPASS.Species,
        COMPASS.CountryArea,
    ]

    def test_concepts_have_exactly_one_dimension_class(self, read_graph):
        """Every concept carries its dimension class alongside skos:Concept.

        shacl_to_filters._multiselect_options() finds a filter's options with
        subjects(RDF.type, dimension_class): none and the concept is missing from
        the panel, two and it shows up under both.
        """
        tag_classes = set(self.TAG_CLASSES)
        wrong = {
            str(concept): sorted(str(c) for c in tag_classes & types)
            for concept in read_graph.subjects(RDF.type, SKOS.Concept)
            if len(tag_classes & (types := set(read_graph.objects(concept, RDF.type)))) != 1
        }
        assert not wrong, f"Concepts without exactly one dimension class: {wrong}"

    def test_tag_classes_have_instances(self, read_graph):
        for cls in self.TAG_CLASSES:
            subjects = list(read_graph.subjects(RDF.type, cls))
            assert len(subjects) > 0, (
                f"No instances of {cls} found. "
                f"The corresponding filter will have no options."
            )


# -- Forum/Programme entities have rdfs:label for tag label discovery --


class TestForumLabels:
    """InternationalForum entities are used as tag values, through
    compass:forum. build_optional() looks up labels via skos:prefLabel /
    rdfs:label, so every Forum entity must have rdfs:label. The tag
    vocabularies label themselves with skos:prefLabel and are covered by
    compass:ConceptShape instead."""

    def test_forums_have_rdfs_label(self, read_graph):
        missing = []
        for s in read_graph.subjects(RDF.type, COMPASS.InternationalForum):
            labels = list(read_graph.objects(s, RDFS.label))
            if not labels:
                missing.append(str(s))
        assert not missing, (
            "InternationalForum entities missing rdfs:label "
            f"(tag labels will be blank): {missing}"
        )


# -- All geo-located entities have a compass:name --


class TestAllGeoEntitiesHaveLabels:
    """_sparql_preamble() does FILTER(BOUND(?label)) via compass:name.
    Entities without compass:name will be silently dropped from the map."""

    def test_geo_entities_have_name(self, read_graph):
        missing = []
        for subj in read_graph.subjects(GEO.lat, None):
            names = list(read_graph.objects(subj, COMPASS.name))
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
        shapes_graph.parse(_SHAPES, format="turtle")

        data_graph = Graph()
        data_graph.parse(os.path.join(_USECASE_DIR, "compass.ttl"), format="turtle")
        data_graph.parse(os.path.join(_USECASE_DIR, "vocab.ttl"), format="turtle")
        data_graph.parse(_SHAPES, format="turtle")

        conforms, _, report_text = pyshacl.validate(
            data_graph,
            shacl_graph=shapes_graph,
            inference="rdfs",
            abort_on_first=False,
        )
        assert conforms, f"SHACL validation failed:\n{report_text}"

    def test_shapes_conform_to_the_meta_shapes(self):
        """shapes.ttl must itself satisfy shacl-shacl.ttl.

        No RDFS entailment, unlike the instance-data check: it would infer every
        predicate used in the file to be an rdf:Property and then demand labels
        for rdf:type, rdfs:label and the sh: vocabulary.
        """
        meta_graph = Graph()
        meta_graph.parse(_SHACL_SHACL, format="turtle")

        shapes_graph = Graph()
        shapes_graph.parse(_SHAPES, format="turtle")

        conforms, _, report_text = pyshacl.validate(
            shapes_graph,
            shacl_graph=meta_graph,
            inference="none",
            abort_on_first=False,
        )
        assert conforms, f"shapes.ttl violates shacl-shacl.ttl:\n{report_text}"
