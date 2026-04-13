"""Shared fixtures for backend tests.

Provides a real RDFStore loaded from the ontology files so tests validate
against the actual data/shapes/vocab rather than synthetic mocks.
"""
import os
import pytest

from app.rdf import RDFStore


_BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_ONTOLOGY_DIR = os.path.join(_BASE_DIR, "ontology")


@pytest.fixture(scope="session")
def store() -> RDFStore:
    """Session-scoped RDFStore loaded from the real ontology files."""
    return RDFStore(
        data_path=os.path.join(_ONTOLOGY_DIR, "compass.ttl"),
        shapes_path=os.path.join(_ONTOLOGY_DIR, "shapes.ttl"),
        vocab_path=os.path.join(_ONTOLOGY_DIR, "vocab.ttl"),
    )


@pytest.fixture(scope="session")
def rdflib_graph(store: RDFStore):
    """Session-scoped rdflib Graph for SHACL introspection tests."""
    return store.rdflib_graph


@pytest.fixture(scope="session")
def property_specs(store: RDFStore):
    """Cached property specs from SHACL shapes."""
    return store.get_property_specs()
