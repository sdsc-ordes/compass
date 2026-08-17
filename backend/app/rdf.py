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


def get_store() -> RDFStore:
    global store_instance
    if store_instance is None:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        store_instance = RDFStore(
            data_path=os.path.join(base_dir, "ontology", "compass.ttl"),
            shapes_path=os.path.join(base_dir, "ontology", "shapes.ttl"),
            vocab_path=os.path.join(base_dir, "ontology", "vocab.ttl"),
        )
    return store_instance
