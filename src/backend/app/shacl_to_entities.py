"""SHACL → EntityShape descriptors for SPARQL build and GeoJSON decode.

Parallel to ``shacl_to_filters``: both walk the same NodeShapes; this
module projects ``EntityShape`` descriptors, not filter UI widgets. Instance
data is filled later by SPARQL over ``compass.ttl``.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from rdflib import RDF, SH, Graph, URIRef
from rdflib import Literal as RDFLiteral
from rdflib.namespace import SKOS, XSD
from rdflib.term import Node

from app.namespaces import COMPASS, GEO, SCHEMA

PropertyCategory = Literal[
    "lang_literal",
    "simple_literal",
    "uri_literal",
    "iri_with_label",
    "boolean",
]
FilterType = Literal["multiselect", "slider", "datepicker", "toggle", "none"]

BUILTIN_PATHS = {GEO.lat, GEO.long, COMPASS.name}

DISPLAY_ONLY = {
    SCHEMA.url,
    SCHEMA.image,
    COMPASS.description,
    COMPASS.location,
    SKOS.altLabel,
    COMPASS.relatedOrganization,
}

_FILTER_BY_CATEGORY: dict[str, FilterType] = {
    "boolean": "toggle",
    "iri_with_label": "multiselect",
}
_FILTER_BY_DATATYPE: dict[str, FilterType] = {
    str(XSD.integer): "slider",
    str(XSD.float): "slider",
    str(XSD.double): "slider",
    str(XSD.gYear): "slider",
    str(XSD.date): "datepicker",
}


class EntityShape(BaseModel):
    """One property descriptor projected from SHACL (not an instance)."""

    model_config = ConfigDict(frozen=True)

    id: str = Field(description="Local name of the property path (SPARQL variable base).")
    path_iri: str = Field(description="Full IRI of the sh:path predicate.")
    category: PropertyCategory = Field(
        description="How values are bound in SPARQL and decoded into GeoJSON."
    )
    is_multi: bool = Field(
        description="True when multiple values are expected (GROUP_CONCAT path)."
    )
    filter_type: FilterType = Field(
        description="Widget used to filter this property, or ``none`` if display-only."
    )
    datatype: str | None = Field(
        default=None,
        description="XSD datatype IRI from sh:datatype, when present.",
    )


def get_shacl_property(g: Graph) -> Iterator[URIRef]:
    """Yield every sh:property IRI of every NodeShape that has a sh:targetClass.

    Args:
        g: Merged ontology graph (shapes + data + vocab).

    Yields:
        ``URIRef`` property-shape subjects, de-duplicated.
    """
    seen: set = set()
    for node_shape in g.subjects(SH.targetClass, None):
        for p in g.objects(node_shape, SH.property):
            if isinstance(p, URIRef) and p not in seen:
                seen.add(p)
                yield p


def get_shacl_label(g: Graph, subject: URIRef, predicate: URIRef, lang: str) -> str:
    """Return a label in *lang*, falling back to English, then any available label.

    Args:
        g: Ontology graph.
        subject: Resource whose label is sought.
        predicate: Preferred label predicate (e.g. ``sh:name``, ``rdfs:label``).
        lang: BCP 47 language tag.

    Returns:
        Best-matching label string, or the subject's local name as last resort.
    """
    candidates = list(g.objects(subject, predicate))
    if predicate != SKOS.prefLabel:
        candidates += list(g.objects(subject, SKOS.prefLabel))

    for label in candidates:
        if isinstance(label, RDFLiteral) and label.language == lang:
            return str(label)
    for label in candidates:
        if isinstance(label, RDFLiteral) and label.language == "en":
            return str(label)
    if candidates:
        return str(candidates[0])
    return str(subject).split("#")[-1].split("/")[-1]


def get_entity_shape_from_shacl(g: Graph) -> list[EntityShape]:
    """Project SHACL property shapes into EntityShape descriptors for query and decode.

    Args:
        g: Merged ontology graph.

    Returns:
        One ``EntityShape`` per filterable/display property (builtins skipped).
    """
    fields: list[EntityShape] = []

    for property_node in get_shacl_property(g):
        path = g.value(property_node, SH.path)
        if path is None or path in BUILTIN_PATHS:
            continue

        path_str = str(path)
        datatype = g.value(property_node, SH.datatype)
        target_class = g.value(property_node, SH["class"])
        sh_in_list = list(g.objects(property_node, SH["in"]))
        node_kind = g.value(property_node, SH.nodeKind)
        max_count_val = g.value(property_node, SH.maxCount)

        one_per_language = (
            datatype == RDF.langString
            and str(g.value(property_node, SH.uniqueLang)).lower() == "true"
        )
        is_multi = not one_per_language and (
            max_count_val is None or int(str(max_count_val)) != 1
        )
        is_iri = (
            (node_kind is not None and str(node_kind) == str(SH.IRI))
            or target_class is not None
            or bool(sh_in_list)
        )

        category = _infer_category(datatype, is_iri)
        filter_type = _infer_filter_type(path, category, datatype)

        fields.append(
            EntityShape(
                id=path_str.rsplit("#", maxsplit=1)[-1].rsplit("/", maxsplit=1)[-1],
                path_iri=path_str,
                category=category,
                is_multi=is_multi,
                filter_type=filter_type,
                datatype=str(datatype) if datatype else None,
            )
        )

    return fields


def _infer_category(datatype: Node | None, is_iri: bool) -> PropertyCategory:
    """Map SHACL datatype / IRI-ness to a SPARQL binding category.

    Args:
        datatype: ``sh:datatype`` value, or ``None``.
        is_iri: True when the property values are IRIs (class, nodeKind, or sh:in).

    Returns:
        Category string consumed by the SPARQL builder and GeoJSON translator.
    """
    if is_iri:
        return "iri_with_label"
    if datatype is not None and str(datatype) == str(XSD.anyURI):
        return "uri_literal"
    if datatype is not None and str(datatype) == str(XSD.boolean):
        return "boolean"
    if datatype is not None and str(datatype) in (str(XSD.string), str(RDF.langString)):
        return "lang_literal"
    return "simple_literal"


def _infer_filter_type(path: Node, category: str, datatype: Node | None) -> FilterType:
    """Choose the filter widget for a property, or ``none`` if display-only.

    Args:
        path: Property path URIRef.
        category: Inferred ``PropertyCategory``.
        datatype: ``sh:datatype`` value, or ``None``.

    Returns:
        Filter widget type used by the panel, or ``none``.
    """
    if path in DISPLAY_ONLY or category == "uri_literal":
        return "none"
    if category in _FILTER_BY_CATEGORY:
        return _FILTER_BY_CATEGORY[category]
    by_datatype = _FILTER_BY_DATATYPE.get(str(datatype) if datatype is not None else "")
    if by_datatype:
        return by_datatype
    return "multiselect" if category == "lang_literal" else "none"
