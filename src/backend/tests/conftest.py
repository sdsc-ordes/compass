"""Shared fixtures: the real ontology store and an API client over it."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from rdflib import Graph

from app.main import app
from app.rdf import RDFStore
from app.shacl_to_entities import EntityShape


@pytest.fixture(scope="session")
def store() -> RDFStore:
    """RDFStore loaded from the configured ontology files."""
    return RDFStore.from_settings()


@pytest.fixture(scope="session")
def graph(store: RDFStore) -> Graph:
    """Merged rdflib graph of the ontology."""
    return store.graph


@pytest.fixture(scope="session")
def entity_shapes(store: RDFStore) -> list[EntityShape]:
    """EntityShape list projected from the SHACL shapes."""
    return store.entity_shapes()


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    """TestClient with the app lifespan running."""
    with TestClient(app) as test_client:
        yield test_client
