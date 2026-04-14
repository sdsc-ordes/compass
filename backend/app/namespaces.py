"""
Shared RDF namespace definitions and SPARQL prefix declarations.

Single source of truth for all namespace URIs and prefix shorthands used
across rdf.py, schema.py, sparql_builder.py, and result_parser.py.
"""
from rdflib import Namespace

OCORG = Namespace("http://example.org/ocean-org/ontology#")
GEO = Namespace("http://www.w3.org/2003/01/geo/wgs84_pos#")
COMPASS = Namespace("http://oceancare.org/compass/")
SCHEMA = Namespace("https://schema.org/")

# Maps full namespace URIs to their SPARQL shorthand prefix (used by to_prefixed())
PREFIX_MAP: dict[str, str] = {
    "http://example.org/ocean-org/ontology#": "ocorg:",
    "http://www.w3.org/2003/01/geo/wgs84_pos#": "geo:",
    "https://schema.org/": "schema:",
}

SPARQL_PREFIXES = """
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
    PREFIX ocorg: <http://example.org/ocean-org/ontology#>
    PREFIX schema: <https://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    """
