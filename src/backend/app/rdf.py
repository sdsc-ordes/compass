"""RDF store wrapper: Oxigraph for SPARQL, rdflib for SHACL introspection."""

from __future__ import annotations

import logging
import os
import time
from typing import Any, ClassVar

import pyoxigraph
from rdflib import Graph

from .core.exceptions import QueryError, ReloadError
from .core.settings import settings
from .shacl_to_entities import EntityShape, get_entity_shape_from_shacl

logger = logging.getLogger(__name__)


class RDFStore:
    def __init__(self, data_path: str, shapes_path: str, vocab_path: str):
        self.store = pyoxigraph.Store()
        self.data_path = data_path
        self.shapes_path = shapes_path
        self.vocab_path = vocab_path
        self._read_graph: Graph | None = None
        self._entity_shapes_cache: list[EntityShape] | None = None
        self.load_data()

    def load_data(self) -> None:
        with open(self.data_path, "rb") as f:
            self.store.load(f, pyoxigraph.RdfFormat.TURTLE)
        with open(self.shapes_path, "rb") as f:
            self.store.load(f, pyoxigraph.RdfFormat.TURTLE)
        with open(self.vocab_path, "rb") as f:
            self.store.load(f, pyoxigraph.RdfFormat.TURTLE)

    @property
    def read_graph(self) -> Graph:
        """Parsed once and shared — rdflib parsing of all three files is slow."""
        if self._read_graph is None:
            g = Graph()
            g.parse(self.shapes_path, format="turtle")
            g.parse(self.data_path, format="turtle")
            g.parse(self.vocab_path, format="turtle")
            self._read_graph = g
        return self._read_graph

    def query(self, sparql: str) -> list[dict[str, Any]]:
        """Run a SPARQL SELECT; one dict per row, unbound variables omitted.

        Raise QueryError, with the query that failed attached, so the cause is
        recoverable from the trace rather than surfacing as a bare 500.
        """
        start = time.time()
        try:
            results = self.store.query(sparql)
            parsed = []
            for row in results:
                item = {}
                for var in results.variables:
                    val = row[var]
                    if val is not None:
                        item[var.value] = (
                            f"_:{val.value}"
                            if isinstance(val, pyoxigraph.BlankNode)
                            else val.value
                        )
                parsed.append(item)
            logger.debug("SPARQL query executed in %.4fs", time.time() - start)
            return parsed
        except Exception as exc:
            logger.exception("SPARQL query failed:\n%s", sparql)
            raise QueryError(sparql, exc) from exc

    def get_entities(self) -> list[EntityShape]:
        if self._entity_shapes_cache is None:
            self._entity_shapes_cache = get_entity_shape_from_shacl(self.read_graph)
        return self._entity_shapes_cache

    def validate(self) -> None:
        """Reject a store that parsed but cannot answer a query.

        Turtle can parse and still be useless -- a truncated file, or shapes that
        no longer describe the data -- and a reload that swapped such a store in
        would take the map down. Deriving entity shapes exercises the SHACL
        introspection the whole query layer is built on, and counting entities
        proves the data reached the store.
        """
        shapes = self.get_entities()
        if not shapes:
            raise ReloadError(
                "the shapes yielded no EntityShape fields, so no filter would work"
            )
        rows = self.query(
            "PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#> "
            "SELECT (COUNT(DISTINCT ?s) AS ?n) WHERE { ?s geo:lat ?lat . }"
        )
        if not rows or int(rows[0].get("n", 0)) == 0:
            raise ReloadError(
                "no entity in the data has coordinates, so the map would be empty"
            )

    _instance: ClassVar[RDFStore | None] = None

    @classmethod
    def from_settings(cls) -> RDFStore:
        """Build a store from the configured ontology directory."""
        directory = str(settings.ontology_dir)
        return cls(
            data_path=os.path.join(directory, "compass.ttl"),
            shapes_path=os.path.join(directory, "shapes.ttl"),
            vocab_path=os.path.join(directory, "vocab.ttl"),
        )

    @classmethod
    def instance(cls) -> RDFStore:
        """Return the single live store, creating it from settings if needed."""
        if cls._instance is None:
            cls._instance = cls.from_settings()
        return cls._instance

    @classmethod
    def reload_instance(cls) -> dict[str, Any]:
        """Swap in the files currently on disk, keeping the live store on failure.

        The candidate is built and validated in full before `_instance` moves,
        so a bad edit leaves the last good version serving rather than taking the
        API down with it.
        """
        try:
            candidate = cls.from_settings()
            candidate.validate()
        except ReloadError:
            raise
        except Exception as exc:
            raise ReloadError(f"{type(exc).__name__}: {exc}") from exc

        previous = cls._instance
        cls._instance = candidate
        logger.info("ontology reloaded from %s", settings.ontology_dir)
        return {
            "reloaded": True,
            "source": str(settings.ontology_dir),
            "replaced_a_running_store": previous is not None,
        }
