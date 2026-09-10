"""SHACL → filter panel widgets (multiselect, slider, datepicker, toggle)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from rdflib import RDF, RDFS, SH, Graph, URIRef
from rdflib import Literal as RDFLiteral
from rdflib.collection import Collection
from rdflib.namespace import XSD
from rdflib.term import Node

from app.namespaces import COMPASS
from app.shacl_to_entities import (
    BUILTIN_PATHS,
    DISPLAY_ONLY,
    get_shacl_label,
    get_shacl_property,
)

FilterWidgetType = Literal["multiselect", "slider", "datepicker", "toggle"]

_SKIP_PROPS = BUILTIN_PATHS | DISPLAY_ONLY


class FilterOption(BaseModel):
    """One selectable value inside a multiselect filter widget."""

    model_config = ConfigDict(frozen=True)

    value: str = Field(description="Wire value sent as a query parameter (often an IRI).")
    label: str = Field(description="Human-readable label shown in the filter panel.")


class FilterWidget(BaseModel):
    """One filter-panel widget derived from SHACL (UI only; not SPARQL)."""

    model_config = ConfigDict(frozen=True)

    id: str = Field(description="Stable dimension id (local name of the property path).")
    path: str = Field(description="Full IRI of the filtered property (or rdf:type).")
    label: str = Field(description="Section title shown in the filter panel.")
    type: FilterWidgetType = Field(description="Widget kind rendered by the frontend.")
    order: int = Field(default=0, description="Optional sort hint (currently unused).")
    options: list[FilterOption] | None = Field(
        default=None,
        description="Choices for multiselect widgets; null for other types.",
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

    for property in get_shacl_property(g):
        path = g.value(property, SH.path)
        if path in _SKIP_PROPS:
            continue

        datatype = g.value(property, SH.datatype)
        if datatype == XSD.anyURI:
            continue

        target_class = g.value(property, SH["class"])
        sh_in_list = list(g.objects(property, SH["in"]))
        path_str = str(path)
        local_name = path_str.rsplit("#", maxsplit=1)[-1].rsplit("/", maxsplit=1)[-1]

        widget = _infer_widget(datatype)
        options = None
        min_v = max_v = None
        if widget == "multiselect":
            options = _multiselect_options(g, path, target_class, sh_in_list, lang)
        elif widget == "slider":
            bounds = _slider_bounds(g, property, path, datatype)
            min_v, max_v = bounds["min"], bounds["max"]
        elif widget == "datepicker":
            bounds = _datepicker_bounds(g, path)
            min_v, max_v = bounds["min"], bounds["max"]

        filters.append(
            FilterWidget(
                id=local_name,
                path=path_str,
                label=get_shacl_label(g, property, SH.name, lang),
                type=widget,
                order=0,
                options=options,
                min=min_v,
                max=max_v,
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
    if datatype in {XSD.integer, XSD.float, XSD.gYear}:
        return "slider"
    if datatype == XSD.date:
        return "datepicker"
    if datatype == XSD.boolean:
        return "toggle"
    return "multiselect"


def _multiselect_options(
    g: Graph,
    path: Node,
    target_class: Node | None,
    sh_in_list: list[Node],
    lang: str,
) -> list[FilterOption]:
    """Collect multiselect choices from class instances, sh:in, or observed values.

    Args:
        g: Ontology graph.
        path: Property path URIRef.
        target_class: ``sh:class`` constraint, if any.
        sh_in_list: Objects of ``sh:in``, if any.
        lang: Preferred label language.

    Returns:
        Options sorted by label.
    """
    options: list[FilterOption] = []
    if target_class:
        for s in g.subjects(RDF.type, target_class):
            options.append(
                FilterOption(value=str(s), label=get_shacl_label(g, s, RDFS.label, lang))
            )
    elif sh_in_list:
        for member in Collection(g, sh_in_list[0]):
            options.append(
                FilterOption(
                    value=str(member),
                    label=get_shacl_label(g, member, RDFS.label, lang),
                )
            )
    else:
        seen: dict[str, FilterOption] = {}
        for val in g.objects(None, path):
            if isinstance(val, URIRef):
                key = str(val)
                if key not in seen:
                    seen[key] = FilterOption(
                        value=key,
                        label=get_shacl_label(g, val, RDFS.label, lang),
                    )
            elif isinstance(val, RDFLiteral) and (
                val.language == lang or val.language is None
            ):
                key = str(val)
                if key not in seen:
                    seen[key] = FilterOption(value=key, label=key)
        options = list(seen.values())
    return sorted(options, key=lambda x: x.label)


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
    g: Graph, property: Node, path: Node, datatype: Node | None
) -> dict[str, float | int]:
    """Compute min/max for a slider from SHACL bounds or observed values.

    Args:
        g: Ontology graph.
        property: Property-shape subject.
        path: Property path.
        datatype: XSD datatype (affects gYear defaults).

    Returns:
        Dict with ``min`` and ``max`` keys.
    """
    vals = _numeric_values(g, path)
    if datatype == XSD.gYear:
        return {"min": min(vals) if vals else 1900, "max": max(vals) if vals else 2026}
    return {
        "min": int(g.value(property, SH.minInclusive) or (min(vals) if vals else 0)),
        "max": int(g.value(property, SH.maxInclusive) or (max(vals) if vals else 1000)),
    }


def _datepicker_bounds(g: Graph, path: Node) -> dict[str, str]:
    """Compute min/max ISO date strings from observed values.

    Args:
        g: Ontology graph.
        path: Property path.

    Returns:
        Dict with ``min`` and ``max`` date strings.
    """
    date_vals = sorted([str(v) for v in g.objects(None, path) if str(v)])
    return {
        "min": date_vals[0] if date_vals else "2000-01-01",
        "max": date_vals[-1] if date_vals else "2026-12-31",
    }


def _entity_type_dimension(g: Graph, lang: str) -> FilterWidget:
    """Build the entity-type multiselect for the four Compass pin classes.

    Args:
        g: Ontology graph (for class labels).
        lang: UI language.

    Returns:
        Synthetic ``entityType`` widget over ``rdf:type``.
    """
    type_classes = [
        COMPASS.InternationalForum,
        COMPASS.Network,
        COMPASS.PartnerOrganization,
        COMPASS.Project,
    ]
    return FilterWidget(
        id="entityType",
        path=str(RDF.type),
        label="Entity Type" if lang == "en" else "Eintragsart",
        type="multiselect",
        order=0,
        options=[
            FilterOption(value=str(cls), label=get_shacl_label(g, cls, RDFS.label, lang))
            for cls in type_classes
        ],
    )
