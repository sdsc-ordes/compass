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

from app.namespaces import COMPASS, GEO
from app.shacl_to_filters import _entity_type_dimension

_ONTOLOGY_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "ontology",
)


# -- Top-level entity classes the SPARQL preamble UNION relies on --


class TestTopLevelEntityClasses:
    """The UNION in _sparql_preamble() requires exactly these 4 classes."""

    REQUIRED_CLASSES: ClassVar[list] = [
        COMPASS.InternationalForum,
        COMPASS.Network,
        COMPASS.Project,
        COMPASS.PartnerOrganization,
    ]

    def test_classes_have_instances(self, read_graph):
        """Each of the 4 entity types must have at least one instance in compass.ttl."""
        for cls in self.REQUIRED_CLASSES:
            subjects = list(read_graph.subjects(RDF.type, cls))
            assert subjects, (
                f"{cls} has no instances in compass.ttl. "
                f"Add at least one instance or remove from _sparql_preamble()."
            )

    def test_entity_type_filter_classes_match_ontology(self, read_graph):
        """shacl_to_filters entity-type dimension hardcodes type classes.
        Verify every class in that list matches what the ontology declares."""
        widget = _entity_type_dimension(read_graph, "en")
        schema_type_iris = {opt.value for opt in widget.options}

        expected = {str(cls) for cls in self.REQUIRED_CLASSES}
        missing = expected - schema_type_iris
        assert expected <= schema_type_iris, (
            f"Entity classes missing from _entity_type_dimension: {missing}"
        )


# -- Required predicates that the SPARQL preamble hardcodes --


class TestRequiredPredicates:
    """Predicates that _sparql_preamble() and _special_optionals() reference directly."""

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


# -- Tag dimension vocabularies exist and have labels --


class TestTagVocabularies:
    """All 6 SKOS-based tag dimension classes must have instances with prefLabels."""

    TAG_CLASSES: ClassVar[list] = [
        COMPASS.WorkArea,
        COMPASS.Conservation,
        COMPASS.Topic,
        COMPASS.Pollution,
        COMPASS.Species,
        COMPASS.CountryArea,
    ]

    def test_tag_classes_have_instances(self, read_graph):
        for cls in self.TAG_CLASSES:
            subjects = list(read_graph.subjects(RDF.type, cls))
            assert len(subjects) > 0, (
                f"No instances of {cls} found. "
                f"The corresponding filter will have no options."
            )

    def test_tag_instances_have_en_prefLabel(self, read_graph):
        for cls in self.TAG_CLASSES:
            for s in read_graph.subjects(RDF.type, cls):
                labels = [
                    label
                    for label in read_graph.objects(s, SKOS.prefLabel)
                    if getattr(label, "language", None) == "en"
                ]
                assert labels, f"{s} (a {cls}) has no English skos:prefLabel"

    def test_tag_instances_have_de_prefLabel(self, read_graph):
        for cls in self.TAG_CLASSES:
            for s in read_graph.subjects(RDF.type, cls):
                labels = [
                    label
                    for label in read_graph.objects(s, SKOS.prefLabel)
                    if getattr(label, "language", None) == "de"
                ]
                assert labels, f"{s} (a {cls}) has no German skos:prefLabel"


# -- Forum/Project entities have rdfs:label for tag label discovery --


class TestForumProjectLabels:
    """InternationalForum and Project entities are used as tag values.
    build_optional() looks up labels via skos:prefLabel / rdfs:label,
    so every Forum/Project entity must have rdfs:label."""

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

    def test_projects_have_rdfs_label(self, read_graph):
        missing = []
        for s in read_graph.subjects(RDF.type, COMPASS.Project):
            labels = list(read_graph.objects(s, RDFS.label))
            if not labels:
                missing.append(str(s))
        assert not missing, (
            f"Project entities missing rdfs:label (tag labels will be blank): {missing}"
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

    def test_shapes_conform_to_the_meta_shapes(self):
        """shapes.ttl must itself satisfy shacl-shacl.ttl.

        No RDFS entailment, unlike the instance-data check: it would infer every
        predicate used in the file to be an rdf:Property and then demand labels
        for rdf:type, rdfs:label and the sh: vocabulary.
        """
        meta_graph = Graph()
        meta_graph.parse(os.path.join(_ONTOLOGY_DIR, "shacl-shacl.ttl"), format="turtle")

        shapes_graph = Graph()
        shapes_graph.parse(os.path.join(_ONTOLOGY_DIR, "shapes.ttl"), format="turtle")

        conforms, _, report_text = pyshacl.validate(
            shapes_graph,
            shacl_graph=meta_graph,
            inference="none",
            abort_on_first=False,
        )
        assert conforms, f"shapes.ttl violates shacl-shacl.ttl:\n{report_text}"
