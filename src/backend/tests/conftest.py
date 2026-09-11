"""Shared fixtures for backend tests.

Provides a real RDFStore loaded from the ontology files so tests validate
against the actual data/shapes/vocab rather than synthetic mocks.
"""

import os

import pytest

from app.core.settings import settings
from app.rdf import RDFStore

_ONTOLOGY_DIR = str(settings.ontology_dir)
_USECASE_DIR = str(settings.use_case_dir)


@pytest.fixture(scope="session")
def store() -> RDFStore:
    """Session-scoped RDFStore loaded from the real ontology files."""
    return RDFStore(
        data_path=os.path.join(_USECASE_DIR, "compass.ttl"),
        shapes_path=os.path.join(_ONTOLOGY_DIR, "shapes.ttl"),
        vocab_path=os.path.join(_USECASE_DIR, "vocab.ttl"),
    )


@pytest.fixture(scope="session")
def read_graph(store: RDFStore):
    """Session-scoped rdflib Graph for SHACL introspection tests."""
    return store.read_graph


@pytest.fixture(scope="session")
def property_specs(store: RDFStore):
    """Cached EntityShape list projected from SHACL shapes."""
    return store.get_entities()
