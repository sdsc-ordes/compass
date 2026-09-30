"""Project SHACL property shapes into filter-panel widgets."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from rdflib import RDF, RDFS, SH, Graph, URIRef
from rdflib import Literal as RDFLiteral
from rdflib.collection import Collection
from rdflib.namespace import SKOS, XSD
from rdflib.term import Node

from app.namespaces import COMPASS, ENTITY_TYPE_ID, FILTERABLE_PIN_CLASSES, local_name
from app.shacl_to_entities import (
    BUILTIN_PATHS,
    DISPLAY_ONLY,
    FILTER_BY_DATATYPE,
    get_definition,
    get_label,
    map_property_shapes,
)

FilterWidgetType = Literal["multiselect", "slider", "datepicker", "toggle"]

_SKIP_PROPS = BUILTIN_PATHS | DISPLAY_ONLY


class FilterOption(BaseModel):
    """One selectable value inside a multiselect filter widget."""

    model_config = ConfigDict(frozen=True)

    value: str = Field(description="Wire value sent as a query parameter (often an IRI).")
    label: str = Field(description="Human-readable label shown in the filter panel.")
    description: str | None = Field(
        default=None,
        description="The concept's skos:definition; absent when it defines none.",
    )


class FilterWidget(BaseModel):
    """One filter-panel widget derived from SHACL (UI only; not SPARQL)."""

    model_config = ConfigDict(frozen=True)

    id: str = Field(description="Stable dimension id (local name of the property path).")
    path: str = Field(description="Full IRI of the filtered property (or rdf:type).")
    label: str = Field(description="Section title shown in the filter panel.")
    description: str | None = Field(
        default=None,
        description="The concept scheme's skos:definition; absent without a scheme.",
    )
    type: FilterWidgetType = Field(description="Widget kind rendered by the frontend.")
    order: int = Field(default=0, description="Sort hint (always 0).")
    options: list[FilterOption] | None = Field(
        default=None,
        description="Choices for multiselect widgets.",
    )
    min: float | int | str | None = Field(
        default=None,
        description="Lower bound for slider / datepicker widgets.",
    )
    max: float | int | str | None = Field(
        default=None,
        description="Upper bound for slider / datepicker widgets.",
    )


def get_filters_from_shacl(g: Graph, lang: str = "en") -> list[FilterWidget]:
    """Build filter-panel dimensions from the SHACL property shapes.

    Args:
        g: Merged ontology graph.
        lang: UI language for labels and literal options.

    Returns:
        Widgets sorted by label, including the synthetic entity-type dimension.
    """
    filters: list[FilterWidget] = []

    for prop_shape in map_property_shapes(g):
        path = g.value(prop_shape, SH.path)
        if path in _SKIP_PROPS:
            continue

        datatype = g.value(prop_shape, SH.datatype)
        if datatype == XSD.anyURI:
            continue

        target_class = g.value(prop_shape, SH["class"])
        widget = _infer_widget(datatype)
        options = None
        low = high = None
        if widget == "multiselect":
            options = _multiselect_options(g, prop_shape, path, target_class, lang)
        elif widget == "slider":
            low, high = _slider_bounds(g, prop_shape, path, datatype)
        elif widget == "datepicker":
            low, high = _datepicker_bounds(g, path)

        filters.append(
            FilterWidget(
                id=local_name(str(path)),
                path=str(path),
                label=get_label(g, prop_shape, SH.name, lang),
                description=_scheme_description(g, target_class, lang),
                type=widget,
                options=options,
                min=low,
                max=high,
            )
        )

    filters.append(_entity_type_dimension(g, lang))
    return sorted(filters, key=lambda x: x.label)


def _infer_widget(datatype: Node | None) -> FilterWidgetType:
    """Map an XSD datatype to a filter widget kind.

    Args:
        datatype: ``sh:datatype`` value, or ``None``.

    Returns:
        Widget type; defaults to ``multiselect``.
    """
    return FILTER_BY_DATATYPE.get(datatype, "multiselect")


def _multiselect_options(
    g: Graph,
    prop_shape: Node,
    path: Node,
    target_class: Node | None,
    lang: str,
) -> list[FilterOption]:
    """Collect multiselect choices from class instances, sh:in, or observed values.

    Args:
        g: Ontology graph.
        prop_shape: Property-shape subject.
        path: Property path URIRef.
        target_class: ``sh:class`` constraint, if any.
        lang: Preferred label language.

    Returns:
        Options sorted by label.
    """
    in_list = g.value(prop_shape, SH["in"])
    if target_class:
        options = [_iri_option(g, s, lang) for s in g.subjects(RDF.type, target_class)]
    elif in_list is not None:
        options = [_iri_option(g, member, lang) for member in Collection(g, in_list)]
    else:
        seen: dict[str, FilterOption] = {}
        for val in g.objects(None, path):
            if isinstance(val, URIRef):
                key = str(val)
                if key not in seen:
                    seen[key] = _iri_option(g, val, lang)
            elif isinstance(val, RDFLiteral) and (
                val.language == lang or val.language is None
            ):
                key = str(val)
                if key not in seen:
                    seen[key] = FilterOption(value=key, label=key)
        options = list(seen.values())
    return sorted(options, key=lambda x: x.label)


def _iri_option(g: Graph, term: URIRef, lang: str) -> FilterOption:
    """Build the option selecting concept *term*.

    Args:
        g: Ontology graph.
        term: Concept IRI the option selects.
        lang: Preferred language for label and definition.

    Returns:
        The option, with ``description`` unset when the concept defines none.
    """
    return FilterOption(
        value=str(term),
        label=get_label(g, term, RDFS.label, lang),
        description=get_definition(g, term, lang),
    )


def _scheme_description(g: Graph, target_class: Node | None, lang: str) -> str | None:
    """Return the definition of the concept scheme a dimension's options sit in.

    The scheme is found through ``skos:inScheme`` of the class instances, not by
    naming convention. Its definition is used over the shape's ``sh:description``
    because the vocabulary carries it in every language.

    Args:
        g: Ontology graph.
        target_class: ``sh:class`` constraint, or ``None``.
        lang: Preferred definition language.

    Returns:
        The definition, or ``None`` when no instance sits in a scheme that
        defines one (e.g. relations to entity classes).
    """
    if target_class is None:
        return None
    for concept in g.subjects(RDF.type, target_class):
        for scheme in g.objects(concept, SKOS.inScheme):
            if isinstance(scheme, URIRef):
                definition = get_definition(g, scheme, lang)
                if definition:
                    return definition
    return None


def _numeric_values(g: Graph, path: Node) -> list[float]:
    """Collect numeric objects of *path* that parse as floats.

    Args:
        g: Ontology graph.
        path: Property path.

    Returns:
        Successfully parsed numeric values (may be empty).
    """
    values = []
    for value in g.objects(None, path):
        try:
            values.append(float(value))
        except (TypeError, ValueError):
            continue
    return values


def _slider_bounds(
    g: Graph, prop_shape: Node, path: Node, datatype: Node | None
) -> tuple[float | int, float | int]:
    """Compute min/max for a slider from SHACL bounds or observed values.

    Args:
        g: Ontology graph.
        prop_shape: Property-shape subject.
        path: Property path.
        datatype: XSD datatype (affects gYear defaults).

    Returns:
        ``(min, max)``.
    """
    values = _numeric_values(g, path)
    if datatype == XSD.gYear:
        return (min(values) if values else 1900, max(values) if values else 2026)
    return (
        int(g.value(prop_shape, SH.minInclusive) or (min(values) if values else 0)),
        int(g.value(prop_shape, SH.maxInclusive) or (max(values) if values else 1000)),
    )


def _datepicker_bounds(g: Graph, path: Node) -> tuple[str, str]:
    """Compute min/max ISO date strings from observed values.

    Args:
        g: Ontology graph.
        path: Property path.

    Returns:
        ``(min, max)`` date strings.
    """
    dates = sorted(str(v) for v in g.objects(None, path) if str(v))
    return (dates[0], dates[-1]) if dates else ("2000-01-01", "2026-12-31")


def _entity_type_dimension(g: Graph, lang: str) -> FilterWidget:
    """Build the entity-type multiselect over the filterable pin classes.

    Args:
        g: Ontology graph (for class labels).
        lang: UI language.

    Returns:
        Synthetic ``entityType`` widget over ``rdf:type``.
    """
    type_classes = [COMPASS[name] for name in sorted(FILTERABLE_PIN_CLASSES)]
    return FilterWidget(
        id=ENTITY_TYPE_ID,
        path=str(RDF.type),
        label="Entity Type" if lang == "en" else "Eintragsart",
        type="multiselect",
        options=[
            FilterOption(value=str(cls), label=get_label(g, cls, RDFS.label, lang))
            for cls in type_classes
        ],
    )
