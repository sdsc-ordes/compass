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

    def test_description_in_entity_shapes(self, rdflib_graph):
        paths = self._entity_prop_paths(rdflib_graph)
        assert COMPASS.description in paths, (
            "compass:description not found in any entity NodeShape property — "
            "the sidebar description paragraph will be missing."
        )

    def test_founding_date_in_entity_shapes(self, rdflib_graph):
        from rdflib import URIRef
        founding_date = URIRef("https://schema.org/foundingDate")
        paths = self._entity_prop_paths(rdflib_graph)
        assert founding_date in paths, (
            "schema:foundingDate not found in any entity NodeShape property — "
            "founding year field will be missing."
        )


# -- Tag dimension vocabularies exist and have labels --

class TestTagVocabularies:
    """All 6 SKOS-based tag dimension classes must have instances with prefLabels."""

    TAG_CLASSES = [
        COMPASS.WorkArea,
        COMPASS.Conservation,
        COMPASS.Topic,
        COMPASS.Pollution,
        COMPASS.Species,
        COMPASS.CountryArea,
    ]

    def test_tag_classes_have_instances(self, rdflib_graph):
        for cls in self.TAG_CLASSES:
            subjects = list(rdflib_graph.subjects(RDF.type, cls))
            assert len(subjects) > 0, (
                f"No instances of {cls} found. "
                f"The corresponding filter will have no options."
            )

    def test_tag_instances_have_en_prefLabel(self, rdflib_graph):
        for cls in self.TAG_CLASSES:
            for s in rdflib_graph.subjects(RDF.type, cls):
                labels = [
                    l for l in rdflib_graph.objects(s, SKOS.prefLabel)
                    if hasattr(l, 'language') and l.language == "en"
                ]
                assert labels, f"{s} (a {cls}) has no English skos:prefLabel"

    def test_tag_instances_have_de_prefLabel(self, rdflib_graph):
        for cls in self.TAG_CLASSES:
            for s in rdflib_graph.subjects(RDF.type, cls):
                labels = [
                    l for l in rdflib_graph.objects(s, SKOS.prefLabel)
                    if hasattr(l, 'language') and l.language == "de"
                ]
                assert labels, f"{s} (a {cls}) has no German skos:prefLabel"


# -- Forum/Project entities have rdfs:label for tag label discovery --

class TestForumProjectLabels:
    """InternationalForum and Project entities are used as tag values.
    build_optional() looks up labels via skos:prefLabel / rdfs:label,
    so every Forum/Project entity must have rdfs:label."""

    def test_forums_have_rdfs_label(self, rdflib_graph):
        missing = []
        for s in rdflib_graph.subjects(RDF.type, COMPASS.InternationalForum):
            labels = list(rdflib_graph.objects(s, RDFS.label))
            if not labels:
                missing.append(str(s))
        assert not missing, (
            f"InternationalForum entities missing rdfs:label (tag labels will be blank): {missing}"
        )

    def test_projects_have_rdfs_label(self, rdflib_graph):
        missing = []
        for s in rdflib_graph.subjects(RDF.type, COMPASS.Project):
            labels = list(rdflib_graph.objects(s, RDFS.label))
            if not labels:
                missing.append(str(s))
        assert not missing, (
            f"Project entities missing rdfs:label (tag labels will be blank): {missing}"
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

    def test_shapes_conform_to_the_meta_shapes(self):
        """shapes.ttl must itself satisfy shacl-shacl.ttl.

        ordes:conceptShape there requires every declared rdf:Property and
        rdfs:Class to carry a label and a comment, which is what the property
        declarations at the top of shapes.ttl exist to satisfy.

        No RDFS entailment here, unlike the instance-data check above: it would
        infer every predicate used anywhere in the file to be an rdf:Property --
        rdf:type, rdfs:label, the whole sh: vocabulary -- and then demand labels
        for terms the specs own and this repo cannot annotate. Without it the
        focus nodes are exactly what shapes.ttl declares.
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
