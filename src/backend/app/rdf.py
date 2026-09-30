"""RDF store wrapper: Oxigraph for SPARQL, rdflib for SHACL introspection."""

from __future__ import annotations

import logging
import time
from typing import Any, ClassVar

import pyoxigraph
from rdflib import Graph

from app.core.exceptions import QueryError, ReloadError
from app.core.settings import settings
from app.shacl_to_entities import EntityShape, get_entity_shapes_from_shacl

logger = logging.getLogger(__name__)


class RDFStore:
    """In-process ontology store used by every query route.

    Oxigraph answers SPARQL; a lazily built rdflib ``Graph`` serves SHACL
    introspection. A single process-wide instance is held on ``_instance``.
    """

    def __init__(self, data_path: str, shapes_path: str, vocab_path: str):
        """Load Turtle files into a fresh Oxigraph store.

        Args:
            data_path: Path to ``compass.ttl`` (instance data).
            shapes_path: Path to ``shapes.ttl`` (SHACL).
            vocab_path: Path to ``vocab.ttl`` (SKOS / class labels).
        """
        self._paths = (shapes_path, data_path, vocab_path)
        self.store = pyoxigraph.Store()
        for path in self._paths:
            with open(path, "rb") as f:
                self.store.load(f, pyoxigraph.RdfFormat.TURTLE)
        self._graph: Graph | None = None
        self._entity_shapes: list[EntityShape] | None = None

    @property
    def graph(self) -> Graph:
        """Merged rdflib graph of shapes, data, and vocab, parsed on first use."""
        if self._graph is None:
            graph = Graph()
            for path in self._paths:
                graph.parse(path, format="turtle")
            self._graph = graph
        return self._graph

    def query(self, sparql: str) -> list[dict[str, Any]]:
        """Run a SPARQL SELECT; one dict per row, unbound variables omitted.

        Args:
            sparql: Full SELECT query string.

        Returns:
            List of row dicts keyed by variable name.

        Raises:
            QueryError: When Oxigraph rejects or fails the query; the query
                text is logged.
        """
        start = time.perf_counter()
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
            logger.debug("SPARQL query executed in %.4fs", time.perf_counter() - start)
            return parsed
        except Exception as exc:
            logger.exception("SPARQL query failed:\n%s", sparql)
            raise QueryError(f"{type(exc).__name__}: {exc}") from exc

    def entity_shapes(self) -> list[EntityShape]:
        """Return the ``EntityShape`` descriptors projected from SHACL, cached.

        Returns:
            Property descriptors used to build SPARQL and decode GeoJSON.
        """
        if self._entity_shapes is None:
            self._entity_shapes = get_entity_shapes_from_shacl(self.graph)
        return self._entity_shapes

    def validate(self) -> None:
        """Reject a store that parsed but cannot drive the map.

        Raises:
            ReloadError: When shapes yield nothing or no entity has coordinates.
        """
        if not self.entity_shapes():
            raise ReloadError(
                "the shapes yielded no EntityShape fields, so no filter would work"
            )
        rows = self.query(
            "PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#> "
            "SELECT (COUNT(DISTINCT ?s) AS ?n) WHERE { ?s geo:lat ?lat . }"
        )
        if int(rows[0]["n"]) == 0:
            raise ReloadError(
                "no entity in the data has coordinates, so the map would be empty"
            )

    _instance: ClassVar[RDFStore | None] = None

    @classmethod
    def from_settings(cls) -> RDFStore:
        """Build a store from the configured ontology and use-case directories.

        Returns:
            New ``RDFStore`` pointing at ``shapes.ttl`` under
            ``settings.ontology_dir`` and ``compass.ttl`` / ``vocab.ttl`` under
            ``settings.use_case_dir``.
        """
        return cls(
            data_path=str(settings.use_case_dir / "compass.ttl"),
            shapes_path=str(settings.ontology_dir / "shapes.ttl"),
            vocab_path=str(settings.use_case_dir / "vocab.ttl"),
        )

    @classmethod
    def instance(cls) -> RDFStore:
        """Return the single live store, creating it from settings if needed.

        Returns:
            Process-wide ``RDFStore`` singleton.
        """
        if cls._instance is None:
            cls._instance = cls.from_settings()
        return cls._instance

    @classmethod
    def reload_instance(cls) -> dict[str, Any]:
        """Swap in the files currently on disk, keeping the live store on failure.

        Returns:
            Status dict with ``reloaded``, ``source``, and
            ``replaced_a_running_store``.

        Raises:
            ReloadError: When the on-disk ontology is not usable.
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
        logger.info("ontology reloaded from %s", settings.use_case_dir)
        return {
            "reloaded": True,
            "source": str(settings.use_case_dir),
            "replaced_a_running_store": previous is not None,
        }
