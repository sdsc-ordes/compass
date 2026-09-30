"""Shared RDF namespaces, entity classes, separators, and SPARQL prefixes."""

from rdflib import Namespace

COMPASS = Namespace("http://example.org/ocean-org/ontology#")
"""Compass ontology namespace (entity classes and properties)."""

GEO = Namespace("http://www.w3.org/2003/01/geo/wgs84_pos#")
"""W3C WGS84 geo namespace (``lat`` / ``long``)."""

SCHEMA = Namespace("https://schema.org/")
"""schema.org namespace (``url``, ``image``, ...)."""

PIN_CLASSES = (
    "InternationalForum",
    "Network",
    "PartnerOrganization",
    "HostOrganization",
)
"""Entity classes the map draws."""

ALWAYS_ON_CLASSES = ("HostOrganization",)
"""Entity classes that keep their pin whatever the filters say.

The backend never counts them in the facets; the frontend adds them to every
count.
"""

FILTERABLE_PIN_CLASSES = tuple(c for c in PIN_CLASSES if c not in ALWAYS_ON_CLASSES)
"""The classes the ``entityType`` dimension offers."""

ENTITY_TYPE_ID = "entityType"
"""Id of the synthetic filter dimension over ``rdf:type``; it has no property shape."""

ITEM_SEP = ";;"
"""Separator between multi-valued items in GROUP_CONCAT output."""

FIELD_SEP = "|"
"""Separator between fields within a single GROUP_CONCAT item (IRI|label)."""

PREFIX_MAP: dict[str, str] = {
    str(COMPASS): "compass:",
    str(GEO): "geo:",
    str(SCHEMA): "schema:",
}
"""Full namespace URI -> SPARQL prefix used by ``to_prefixed``."""

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


def local_name(iri: str) -> str:
    """Return the part of *iri* after its last ``#`` or ``/``.

    Args:
        iri: Absolute IRI string.

    Returns:
        The fragment or final path segment.
    """
    return iri.rsplit("#", maxsplit=1)[-1].rsplit("/", maxsplit=1)[-1]
