"""Shared RDF namespace definitions and SPARQL prefix declarations.

Single source of truth for namespace URIs and prefix shorthands used across
the query layer (``shacl_to_entities``, ``sparql_builder``,
``sparql_to_geojson_translator``).
"""

from rdflib import Namespace

COMPASS = Namespace("http://example.org/ocean-org/ontology#")
"""Compass ontology namespace (entity classes and properties)."""

GEO = Namespace("http://www.w3.org/2003/01/geo/wgs84_pos#")
"""W3C WGS84 geo namespace (``lat`` / ``long``)."""

SCHEMA = Namespace("https://schema.org/")
"""schema.org namespace (``url``, ``image``, …)."""

# Separators used by SPARQL GROUP_CONCAT expressions and the GeoJSON translator
ITEM_SEP = ";;"
"""Separator between multi-valued items in GROUP_CONCAT output."""

FIELD_SEP = "|"
"""Separator between fields within a single GROUP_CONCAT item (IRI|label)."""

# Maps full namespace URIs to their SPARQL shorthand prefix (used by to_prefixed())
PREFIX_MAP: dict[str, str] = {
    "http://example.org/ocean-org/ontology#": "compass:",
    "http://www.w3.org/2003/01/geo/wgs84_pos#": "geo:",
    "https://schema.org/": "schema:",
}
"""Full namespace URI → SPARQL prefix used by ``to_prefixed``."""

SPARQL_PREFIXES = """
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
    PREFIX compass: <http://example.org/ocean-org/ontology#>
    PREFIX schema: <https://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    """
"""PREFIX block prepended to every generated SPARQL query."""
