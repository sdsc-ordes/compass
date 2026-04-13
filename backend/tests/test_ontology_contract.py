"""Ontology contract tests.

These tests verify that the RDF data satisfies the structural assumptions
hardcoded in sparql_builder.py, schema.py, and result_parser.py.

If any of these fail after an ontology edit, the corresponding backend code
will break silently (empty results, missing fields, etc.).
"""
from rdflib import RDF, RDFS, Namespace, URIRef
from rdflib.namespace import SKOS, XSD

from app.namespaces import GEO, OCORG


# -- Top-level classes the SPARQL preamble UNION relies on --

class TestTopLevelClassesExist:
    """The UNION in _sparql_preamble() requires these classes to exist."""

    REQUIRED_CLASSES = [
        OCORG.Organization,
        OCORG.Network,
        OCORG.InternationalForum,
        OCORG.Project,
    ]

    def test_classes_are_defined(self, rdflib_graph):
        for cls in self.REQUIRED_CLASSES:
            subjects = list(rdflib_graph.subjects(RDF.type, cls))
            triples_as_type = list(rdflib_graph.triples((cls, RDF.type, None)))
            assert subjects or triples_as_type, (
                f"{cls} has no instances and is not declared as a type. "
                f"If renamed, update _sparql_preamble() and _add_entity_type_filter()."
            )


class TestOrganizationSubclassHierarchy:
    """All Organization subtypes must be rdfs:subClassOf* ocorg:Organization
    so the generic UNION branch matches them."""

    EXPECTED_SUBCLASSES = [
        OCORG.ResearchInstitute,
        OCORG.University,
        OCORG.GovernmentAgency,
        OCORG.NGO,
    ]

    def test_subclasses_declared(self, rdflib_graph):
        for cls in self.EXPECTED_SUBCLASSES:
            parents = set(rdflib_graph.objects(cls, RDFS.subClassOf))
            assert OCORG.Organization in parents, (
                f"{cls} is not declared rdfs:subClassOf ocorg:Organization. "
                f"Entities of this type won't be found by the subclass query."
            )

    def test_entity_type_filter_classes_match_ontology(self, rdflib_graph):
        """schema.py _add_entity_type_filter() hardcodes a list of type classes.
        Verify every Organization subclass in the ontology is in that list."""
        from app.schema import _add_entity_type_filter

        # Collect what the ontology declares
        ontology_subclasses = set(rdflib_graph.subjects(RDFS.subClassOf, OCORG.Organization))

        # Collect what schema.py uses
        dummy_filters = []
        _add_entity_type_filter(rdflib_graph, dummy_filters, "en")
        schema_type_iris = {opt["value"] for opt in dummy_filters[0]["options"]}

        for cls in ontology_subclasses:
            assert str(cls) in schema_type_iris, (
                f"Ontology subclass {cls} is not listed in _add_entity_type_filter(). "
                f"It won't appear as a filter option."
            )


# -- Required predicates that the SPARQL preamble hardcodes --

class TestRequiredPredicates:
    """Predicates that _sparql_preamble() and _special_optionals() reference directly."""

    def test_geometry_predicates_in_data(self, rdflib_graph):
        lat_triples = list(rdflib_graph.triples((None, GEO.lat, None)))
        long_triples = list(rdflib_graph.triples((None, GEO.long, None)))
        assert lat_triples, "No geo:lat triples found — map will be empty"
        assert long_triples, "No geo:long triples found — map will be empty"

    def test_name_predicates_in_data(self, rdflib_graph):
        org_names = list(rdflib_graph.triples((None, OCORG.organizationName, None)))
        assert org_names, "No ocorg:organizationName triples — organizations will be invisible"

    def test_project_name_in_data(self, rdflib_graph):
        proj_names = list(rdflib_graph.triples((None, OCORG.projectName, None)))
        projects = list(rdflib_graph.subjects(RDF.type, OCORG.Project))
        if projects:
            assert proj_names, "Projects exist but no ocorg:projectName triples — projects will be invisible"

    def test_has_project_in_data(self, rdflib_graph):
        has_proj = list(rdflib_graph.triples((None, OCORG.hasProject, None)))
        assert has_proj, "No ocorg:hasProject triples — project list will be empty"


class TestProjectPredicates:
    """Predicates referenced in _special_optionals() for project fields.
    If any of these are renamed, the corresponding field goes blank."""

    EXPECTED_PROJECT_PREDICATES = [
        OCORG.startDate,
        OCORG.endDate,
        OCORG.imageUrl,
        OCORG.projectUrl,
        OCORG.species,
    ]

    def test_project_predicates_exist(self, rdflib_graph):
        projects = list(rdflib_graph.subjects(RDF.type, OCORG.Project))
        if not projects:
            return  # no projects to test against

        for pred in self.EXPECTED_PROJECT_PREDICATES:
            triples = list(rdflib_graph.triples((None, pred, None)))
            assert triples, (
                f"No triples with predicate {pred}. "
                f"If renamed, update _special_optionals() and _special_selects()."
            )


class TestNetworkForumPredicates:
    """Predicates referenced in _special_optionals() for Network/Forum fields."""

    NETWORK_PREDICATES = [
        (OCORG.memberCount, "memberCount"),
        (OCORG.memberStates, "memberStates"),
        (OCORG.mandate, "mandate"),
    ]

    def test_network_predicates_exist(self, rdflib_graph):
        networks = list(rdflib_graph.subjects(RDF.type, OCORG.Network))
        forums = list(rdflib_graph.subjects(RDF.type, OCORG.InternationalForum))
        if not networks and not forums:
            return

        for pred, name in self.NETWORK_PREDICATES:
            triples = list(rdflib_graph.triples((None, pred, None)))
            assert triples, (
                f"No triples with predicate {pred} ({name}). "
                f"If renamed, update _special_optionals() and _parse_special_properties()."
            )


# -- SHACL shape that drives filters and property specs --

class TestOrganizationShapeExists:
    """schema.py reads ocorg:OrganizationShape. If renamed, everything breaks."""

    def test_shape_has_properties(self, rdflib_graph):
        from rdflib import SH
        props = list(rdflib_graph.objects(OCORG.OrganizationShape, SH.property))
        assert len(props) > 0, (
            "ocorg:OrganizationShape has no sh:property entries — "
            "filters will be empty, SPARQL will have no OPTIONAL clauses."
        )


# -- All entities with coordinates get a label --

class TestAllGeoEntitiesHaveLabels:
    """_sparql_preamble() does FILTER(BOUND(?label)) — entities without
    organizationName or projectName will be silently dropped."""

    def test_geo_entities_have_name(self, rdflib_graph):
        missing = []
        for subj in rdflib_graph.subjects(GEO.lat, None):
            org_name = list(rdflib_graph.objects(subj, OCORG.organizationName))
            proj_name = list(rdflib_graph.objects(subj, OCORG.projectName))
            if not org_name and not proj_name:
                missing.append(str(subj))
        assert not missing, (
            f"Entities with geo:lat but no organizationName/projectName "
            f"(will be invisible on map): {missing}"
        )
