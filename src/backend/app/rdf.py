"""RDF store wrapper: Oxigraph for SPARQL, rdflib for SHACL introspection."""
import logging
import os
import time
import traceback
from typing import Any, Dict, List, Optional

import pyoxigraph
from rdflib import Graph

from . import schema as _schema

logger = logging.getLogger(__name__)


class RDFStore:
    def __init__(self, data_path: str, shapes_path: str, vocab_path: str):
        self.store = pyoxigraph.Store()
        self.data_path = data_path
        self.shapes_path = shapes_path
        self.vocab_path = vocab_path
        self._rdflib_graph: Optional[Graph] = None
        self._property_specs_cache: Optional[List[Dict[str, Any]]] = None
        self.load_data()

    def load_data(self) -> None:
        with open(self.data_path, "rb") as f:
            self.store.load(f, pyoxigraph.RdfFormat.TURTLE)
        with open(self.shapes_path, "rb") as f:
            self.store.load(f, pyoxigraph.RdfFormat.TURTLE)
        with open(self.vocab_path, "rb") as f:
            self.store.load(f, pyoxigraph.RdfFormat.TURTLE)

    @property
    def rdflib_graph(self) -> Graph:
        """Parsed once and shared — rdflib parsing of all three files is slow."""
        if self._rdflib_graph is None:
            g = Graph()
            g.parse(self.shapes_path, format="turtle")
            g.parse(self.data_path, format="turtle")
            g.parse(self.vocab_path, format="turtle")
            self._rdflib_graph = g
        return self._rdflib_graph

    def query(self, sparql: str) -> List[Dict[str, Any]]:
        """Run a SPARQL SELECT; one dict per row, unbound variables omitted."""
        start = time.time()
        try:
            results = self.store.query(sparql)
            parsed = []
            for row in results:
                item = {}
                for var in results.variables:
                    val = row[var]
                    if val is not None:
                        item[var.value] = f"_:{val.value}" if isinstance(val, pyoxigraph.BlankNode) else val.value
                parsed.append(item)
            logger.debug("SPARQL query executed in %.4fs", time.time() - start)
            return parsed
        except Exception:
            traceback.print_exc()
            raise

    def get_filters_schema(self, lang: str = "en") -> List[Dict[str, Any]]:
        return _schema.get_filters_schema(self.rdflib_graph, lang)

    def get_property_specs(self) -> List[Dict[str, Any]]:
        if self._property_specs_cache is None:
            self._property_specs_cache = _schema.get_property_specs(self.rdflib_graph)
        return self._property_specs_cache


store_instance: Optional[RDFStore] = None

# Where the Turtle files live. Set COMPASS_ONTOLOGY_DIR to read them from a
# mounted volume instead of the copy inside the image, so editorial updates do
# not need the image rebuilt.
ONTOLOGY_DIR_ENV = "COMPASS_ONTOLOGY_DIR"


class ReloadError(Exception):
    """The files on disk are not usable. The store already serving is untouched."""


def ontology_dir() -> str:
    configured = os.environ.get(ONTOLOGY_DIR_ENV)
    if configured:
        return configured
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(base_dir, "ontology")


def _build_store() -> RDFStore:
    directory = ontology_dir()
    return RDFStore(
        data_path=os.path.join(directory, "compass.ttl"),
        shapes_path=os.path.join(directory, "shapes.ttl"),
        vocab_path=os.path.join(directory, "vocab.ttl"),
    )


def _validate(candidate: RDFStore) -> None:
    """Reject a store that parsed but cannot answer a query.

    Turtle can parse and still be useless -- a truncated file, or shapes that
    no longer describe the data -- and a reload that swapped such a store in
    would take the map down. Deriving the specs exercises the SHACL
    introspection the whole query layer is built on, and counting entities
    proves the data reached the store.
    """
    specs = candidate.get_property_specs()
    if not specs:
        raise ReloadError("the shapes yielded no property specs, so no filter would work")
    rows = candidate.query(
        "PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#> "
        "SELECT (COUNT(DISTINCT ?s) AS ?n) WHERE { ?s geo:lat ?lat . }"
    )
    if not rows or int(rows[0].get("n", 0)) == 0:
        raise ReloadError("no entity in the data has coordinates, so the map would be empty")


def reload_store() -> Dict[str, Any]:
    """Swap in the files currently on disk, keeping the live store on failure.

    The candidate is built and validated in full before `store_instance` moves,
    so a bad edit leaves the last good version serving rather than taking the
    API down with it.
    """
    global store_instance
    try:
        candidate = _build_store()
        _validate(candidate)
    except ReloadError:
        raise
    except Exception as exc:
        raise ReloadError(f"{type(exc).__name__}: {exc}") from exc

    previous = store_instance
    store_instance = candidate
    logger.info("ontology reloaded from %s", ontology_dir())
    return {
        "reloaded": True,
        "source": ontology_dir(),
        "replaced_a_running_store": previous is not None,
    }


def get_store() -> RDFStore:
    global store_instance
    if store_instance is None:
        store_instance = _build_store()
    return store_instance
