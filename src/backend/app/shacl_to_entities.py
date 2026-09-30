"""Project SHACL property shapes into EntityShape descriptors.

The descriptors drive both SPARQL generation and GeoJSON decoding.
``shacl_to_filters`` walks the same shapes to build the filter panel.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from rdflib import RDF, RDFS, SH, Graph, URIRef
from rdflib import Literal as RDFLiteral
from rdflib.namespace import SKOS, XSD
from rdflib.term import Node

from app.namespaces import COMPASS, GEO, SCHEMA, local_name

PropertyCategory = Literal[
    "lang_literal",
    "simple_literal",
    "uri_literal",
    "iri_with_label",
    "boolean",
]
FilterType = Literal["multiselect", "slider", "datepicker", "toggle", "none"]

BUILTIN_PATHS = {GEO.lat, GEO.long, COMPASS.name}
"""Paths the pin query binds itself, so they are never projected."""

DISPLAY_ONLY = {
    SCHEMA.url,
    SCHEMA.image,
    COMPASS.description,
    COMPASS.location,
    SKOS.altLabel,
    COMPASS.relatedOrganization,
    COMPASS.wpEntityTagId,
}
"""Paths shown on a pin but never offered as a filter."""

FILTER_BY_DATATYPE: dict[Node, FilterType] = {
    XSD.integer: "slider",
    XSD.float: "slider",
    XSD.double: "slider",
    XSD.gYear: "slider",
    XSD.date: "datepicker",
    XSD.boolean: "toggle",
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


def targets_map_entity(g: Graph, node_shape: Node) -> bool:
    """Report whether *node_shape* targets a ``compass:MapEntity`` subclass.

    Shapes targeting anything else (the SKOS tag vocabularies, for instance)
    only validate the generated Turtle and stay out of the map projection.

    Args:
        g: Merged ontology graph (shapes + data + vocab).
        node_shape: Shape to classify.

    Returns:
        ``True`` when any ``sh:targetClass`` is a ``compass:MapEntity`` subclass.
    """
    return any(
        (target, RDFS.subClassOf, COMPASS.MapEntity) in g
        for target in g.objects(node_shape, SH.targetClass)
    )


def map_property_shapes(g: Graph) -> Iterator[URIRef]:
    """Yield every sh:property IRI of every NodeShape targeting a map entity class.

    Args:
        g: Merged ontology graph (shapes + data + vocab).

    Yields:
        ``URIRef`` property-shape subjects, de-duplicated.
    """
    seen: set[URIRef] = set()
    for node_shape in g.subjects(SH.targetClass, None):
        if not targets_map_entity(g, node_shape):
            continue
        for prop_shape in g.objects(node_shape, SH.property):
            if isinstance(prop_shape, URIRef) and prop_shape not in seen:
                seen.add(prop_shape)
                yield prop_shape


def get_definition(g: Graph, subject: URIRef, lang: str) -> str | None:
    """Return a non-blank ``skos:definition`` in *lang*, falling back to English.

    Unlike :func:`get_label`, there is no fallback to any other language.

    Args:
        g: Ontology graph.
        subject: Concept whose definition is sought.
        lang: BCP 47 language tag.

    Returns:
        The definition, or ``None`` when none is defined in either language.
    """
    definitions = [
        d for d in g.objects(subject, SKOS.definition) if isinstance(d, RDFLiteral)
    ]
    for wanted in (lang, "en"):
        for definition in definitions:
            if definition.language == wanted and str(definition).strip():
                return str(definition)
    return None


def get_label(g: Graph, subject: URIRef, predicate: URIRef, lang: str) -> str:
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

    for wanted in (lang, "en"):
        for label in candidates:
            if isinstance(label, RDFLiteral) and label.language == wanted:
                return str(label)
    if candidates:
        return str(candidates[0])
    return local_name(str(subject))


def get_entity_shapes_from_shacl(g: Graph) -> list[EntityShape]:
    """Project SHACL property shapes into EntityShape descriptors for query and decode.

    Args:
        g: Merged ontology graph.

    Returns:
        One ``EntityShape`` per filterable/display property (builtins skipped).
    """
    shapes: list[EntityShape] = []

    for prop_shape in map_property_shapes(g):
        path = g.value(prop_shape, SH.path)
        if path is None or path in BUILTIN_PATHS:
            continue

        datatype = g.value(prop_shape, SH.datatype)
        max_count = g.value(prop_shape, SH.maxCount)
        one_per_language = (
            datatype == RDF.langString
            and str(g.value(prop_shape, SH.uniqueLang)).lower() == "true"
        )
        is_multi = not one_per_language and (max_count is None or int(max_count) != 1)
        is_iri = (
            g.value(prop_shape, SH.nodeKind) == SH.IRI
            or g.value(prop_shape, SH["class"]) is not None
            or g.value(prop_shape, SH["in"]) is not None
        )
        category = _infer_category(datatype, is_iri)

        shapes.append(
            EntityShape(
                id=local_name(str(path)),
                path_iri=str(path),
                category=category,
                is_multi=is_multi,
                filter_type=_infer_filter_type(path, category, datatype),
                datatype=str(datatype) if datatype else None,
            )
        )

    return shapes


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
    if datatype == XSD.anyURI:
        return "uri_literal"
    if datatype == XSD.boolean:
        return "boolean"
    if datatype in (XSD.string, RDF.langString):
        return "lang_literal"
    return "simple_literal"


def _infer_filter_type(
    path: Node, category: PropertyCategory, datatype: Node | None
) -> FilterType:
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
    if category == "iri_with_label":
        return "multiselect"
    if datatype in FILTER_BY_DATATYPE:
        return FILTER_BY_DATATYPE[datatype]
    return "multiselect" if category == "lang_literal" else "none"
