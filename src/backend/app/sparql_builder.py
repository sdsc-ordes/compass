"""SPARQL generation from EntityShape descriptors plus the active filters.

Every generated pattern constrains ``?s``, the pin, whose class is bound to
``?type``.
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any

from rdflib.namespace import XSD

from app.namespaces import (
    ALWAYS_ON_CLASSES,
    ENTITY_TYPE_ID,
    FIELD_SEP,
    FILTERABLE_PIN_CLASSES,
    ITEM_SEP,
    PREFIX_MAP,
    SPARQL_PREFIXES,
)
from app.shacl_to_entities import EntityShape
from app.sparql_terms import iri_term, is_iri, string_literal

# Property id -> (prefixed predicate, datatype IRI or None)
RangeFilters = dict[str, tuple[str, str | None]]


def to_prefixed(iri: str) -> str:
    """Convert a full IRI to a SPARQL prefixed name (e.g. ``compass:country``).

    Args:
        iri: Absolute property IRI.

    Returns:
        Prefixed name when the namespace is known, otherwise an ``<IRIREF>``.
    """
    for namespace, prefix in PREFIX_MAP.items():
        if iri.startswith(namespace):
            return prefix + iri[len(namespace) :]
    return iri_term(iri)


def _is_iri_value(value: str) -> bool:
    """Tell a concept IRI filter value from a literal one.

    A value that is not a safe IRIREF is treated as a literal rather than
    interpolated between brackets.

    Args:
        value: Raw query-parameter value.

    Returns:
        Whether *value* is a safe absolute HTTP(S) IRI.
    """
    return value.startswith(("http://", "https://")) and is_iri(value)


def build_optional(shape: EntityShape, lang: str) -> str:
    """Build the OPTIONAL clause that binds one EntityShape property.

    Args:
        shape: Property descriptor from SHACL.
        lang: Preferred language for labels / langString filters.

    Returns:
        SPARQL OPTIONAL fragment.
    """
    var = shape.id
    path = to_prefixed(shape.path_iri)

    if shape.category == "lang_literal":
        body = f'?s {path} ?{var} . FILTER(lang(?{var}) = "{lang}")'
    elif shape.category == "iri_with_label":
        body = (
            f"?s {path} ?{var}Node .\n"
            f"            OPTIONAL {{ ?{var}Node skos:prefLabel ?{var}Skos . "
            f'FILTER(lang(?{var}Skos) = "{lang}") }}\n'
            f"            OPTIONAL {{ ?{var}Node rdfs:label ?{var}Rdfs . "
            f'FILTER(lang(?{var}Rdfs) = "{lang}") }}\n'
            f"            BIND(COALESCE(?{var}Skos, ?{var}Rdfs) AS ?{var}Lab)"
        )
    else:
        body = f"?s {path} ?{var} ."
    if not shape.is_multi:
        return f"OPTIONAL {{\n            {body}\n        }}"
    # Folding each multi-valued property in its own subquery keeps one row per
    # pin; side by side in the outer WHERE the lists would join into their
    # cross product.
    return (
        f"OPTIONAL {{\n"
        f"            SELECT ?s {_group_concat(shape)}\n"
        f"            WHERE {{\n            {body}\n            }}\n"
        f"            GROUP BY ?s\n"
        f"        }}"
    )


def _group_concat(shape: EntityShape) -> str:
    """Build the GROUP_CONCAT folding a multi-valued property into ``?<id>Agg``."""
    var = shape.id
    if shape.category == "iri_with_label":
        item = f'CONCAT(STR(?{var}Node), "{FIELD_SEP}", COALESCE(?{var}Lab, ""))'
    else:
        item = f"?{var}"
    return f'(GROUP_CONCAT(DISTINCT {item}; separator="{ITEM_SEP}") AS ?{var}Agg)'


def build_select_expr(shape: EntityShape) -> str:
    """Build the SELECT projection sampling one property from its group.

    Args:
        shape: Property descriptor from SHACL.

    Returns:
        SELECT projection expression(s) for this property.
    """
    var = shape.id
    if shape.is_multi:
        return f"(SAMPLE(?{var}Agg) AS ?{var}Raw)"
    if shape.category == "iri_with_label":
        return (
            f"(SAMPLE(?{var}Node) AS ?{var}Iri)\n"
            f"           (SAMPLE(?{var}Lab) AS ?{var}Label)"
        )
    return f"(SAMPLE(?{var}) AS ?{var}Result)"


def _class_union(names: tuple[str, ...], indent: str) -> str:
    """Build the UNION of class branches, each binding ``?type`` to its class.

    Args:
        names: Local names of the entity classes to match.
        indent: Leading whitespace for generated lines.

    Returns:
        SPARQL group pattern alternatives, without a trailing newline.
    """
    return f"\n{indent}UNION ".join(
        f"{{ ?s a compass:{name} . BIND(compass:{name} AS ?type) }}" for name in names
    )


def _pin_branch(where_clauses: list[str], *, with_always_on: bool = False) -> str:
    """Build the UNION of the entity classes that carry coordinates.

    Args:
        where_clauses: Extra FILTER / pattern lines applied to each filtered pin.
        with_always_on: Also emit ``ALWAYS_ON_CLASSES``, outside the filtered
            group so no clause reaches them. Off for facet counts, which never
            count them.

    Returns:
        SPARQL WHERE fragment for map pins.
    """
    indent = "        "
    inner = indent + "    " if with_always_on else indent
    body = f"{inner}{_class_union(FILTERABLE_PIN_CLASSES, inner)}\n"
    if where_clauses:
        body += inner + f"\n{inner}".join(where_clauses) + "\n"
    if not with_always_on:
        return body
    return (
        f"{indent}{{\n"
        + body
        + f"{indent}}} UNION {{\n"
        + f"{inner}{_class_union(ALWAYS_ON_CLASSES, inner)}\n"
        + f"{indent}}}\n"
    )


def _shared_optionals(lang: str) -> str:
    """Bind geometry and labels for every pin.

    Coordinates stay OPTIONAL so a pin missing them reaches the decoder, which
    logs it. The name is required, so a pin without one in *lang* drops out.

    Args:
        lang: Preferred language tag.

    Returns:
        SPARQL OPTIONAL / FILTER block.
    """
    return f"""        OPTIONAL {{ ?s geo:lat ?lat . }}
        OPTIONAL {{ ?s geo:long ?long . }}
        ?s compass:name ?label . FILTER(lang(?label) = "{lang}")
        OPTIONAL {{ ?type rdfs:label ?typeLabel . FILTER(lang(?typeLabel) = "{lang}") }}
"""


def _build_where_clauses(
    query_params: Any,
    value_filters: dict[str, str],
    range_filters: RangeFilters,
    date_filters: dict[str, str],
    *,
    exclude_key: str | None = None,
) -> list[str]:
    """Translate HTTP query params into SPARQL WHERE fragments.

    Values within one tag dimension, and dimensions with each other, combine
    with AND. ``entityType`` values combine with OR: an entity has exactly one
    class, so requiring two would match nothing.

    Args:
        query_params: Starlette/FastAPI query parameter multi-dict.
        value_filters: Multiselect/toggle property id -> prefixed predicate.
        range_filters: Slider property id -> (predicate, datatype).
        date_filters: Datepicker property id -> prefixed predicate.
        exclude_key: Dimension id whose own constraints are dropped.

    Returns:
        List of SPARQL pattern / FILTER lines.
    """
    where_clauses = []

    for key, val in query_params.items():
        if key in ("lang", exclude_key) or not val:
            continue
        values = query_params.getlist(key)
        var = f"?{key}Val"

        if key in value_filters:
            prop = value_filters[key]
            # One variable cannot equal two literals, so each literal value
            # gets its own; repeats are dropped as they constrain nothing.
            for index, value in enumerate(dict.fromkeys(v for v in values if v)):
                if _is_iri_value(value):
                    where_clauses.append(f"?s {prop} {iri_term(value)} .")
                else:
                    value_var = f"{var}{index}"
                    where_clauses.append(
                        f"?s {prop} {value_var} . "
                        f"FILTER(str({value_var}) = {string_literal(value)})"
                    )

        elif key in date_filters:
            try:
                date.fromisoformat(val)
            except ValueError:
                continue
            prop = date_filters[key]
            where_clauses.append(
                f"OPTIONAL {{ ?s {prop} {var} . }} "
                f"FILTER(!BOUND({var}) || {var} >= {string_literal(val)}^^xsd:date)"
            )

        elif key == ENTITY_TYPE_ID:
            iri_list = ", ".join(iri_term(v) for v in values if _is_iri_value(v))
            if iri_list:
                where_clauses.append(f"FILTER(?type IN ({iri_list}))")

        elif key in range_filters:
            prop, datatype = range_filters[key]
            try:
                threshold = float(val)
            except ValueError:
                continue
            if not math.isfinite(threshold):
                continue
            if datatype == str(XSD.gYear):
                literal = f'"{int(threshold)}"^^xsd:gYear'
            else:
                literal = str(threshold)
            where_clauses.append(
                f"OPTIONAL {{ ?s {prop} {var} . }} "
                f"FILTER(!BOUND({var}) || {var} >= {literal})"
            )

    return where_clauses


def _categorize_shapes(
    shapes: list[EntityShape],
) -> tuple[dict[str, str], RangeFilters, dict[str, str]]:
    """Split EntityShapes into value, range, and date filter maps.

    Args:
        shapes: SHACL-projected property descriptors.

    Returns:
        Tuple of ``(value_filters, range_filters, date_filters)``.
    """
    value_filters: dict[str, str] = {}
    range_filters: RangeFilters = {}
    date_filters: dict[str, str] = {}
    for shape in shapes:
        prefixed = to_prefixed(shape.path_iri)
        if shape.filter_type in ("multiselect", "toggle"):
            value_filters[shape.id] = prefixed
        elif shape.filter_type == "slider":
            range_filters[shape.id] = (prefixed, shape.datatype)
        elif shape.filter_type == "datepicker":
            date_filters[shape.id] = prefixed
    return value_filters, range_filters, date_filters


def build_facet_query(
    shapes: list[EntityShape], lang: str, query_params: Any, target_id: str
) -> str:
    """Count entities per value of one dimension.

    A count reads "how many results if I also pick this", so a tag dimension
    keeps its own selection. ``entityType`` drops its own picks instead:
    being disjunctive, every unpicked class would otherwise count zero.

    Args:
        shapes: EntityShape list for the ontology.
        lang: Preferred language for shared optionals.
        query_params: Active filter query parameters.
        target_id: Dimension whose values are counted.

    Returns:
        Complete SPARQL SELECT counting ``?n`` per ``?val``.
    """
    value_filters, range_filters, date_filters = _categorize_shapes(shapes)

    exclude_key = target_id if target_id == ENTITY_TYPE_ID else None
    where_clauses = _build_where_clauses(
        query_params, value_filters, range_filters, date_filters, exclude_key=exclude_key
    )

    sparql_where = _pin_branch(where_clauses)
    if target_id == ENTITY_TYPE_ID:
        selected, grouped = "(?type AS ?val)", "?type"
    else:
        selected, grouped = "?val", "?val"
        sparql_where += f"        ?s {value_filters[target_id]} ?val .\n"
    sparql_where += _shared_optionals(lang)

    return (
        SPARQL_PREFIXES
        + f"    SELECT {selected} (COUNT(DISTINCT ?s) AS ?n)\n"
        + "    WHERE {\n"
        + sparql_where
        + "    }\n"
        + f"    GROUP BY {grouped}\n"
    )


def sparql_for_instances(shapes: list[EntityShape], lang: str, query_params: Any) -> str:
    """Compile the main entity SELECT for the map.

    Args:
        shapes: EntityShape list for the ontology.
        lang: Preferred language.
        query_params: Active filter query parameters.

    Returns:
        Complete SPARQL SELECT returning one grouped row per entity.
    """
    value_filters, range_filters, date_filters = _categorize_shapes(shapes)

    optionals = "\n        ".join(build_optional(shape, lang) for shape in shapes)
    selects = "\n           ".join(build_select_expr(shape) for shape in shapes)
    pin_clauses = _build_where_clauses(
        query_params, value_filters, range_filters, date_filters
    )

    sparql_where = _pin_branch(pin_clauses, with_always_on=True)
    sparql_where += _shared_optionals(lang)
    sparql_where += "        " + optionals + "\n"

    return (
        SPARQL_PREFIXES
        + "    SELECT ?s ?label ?lat ?long ?type\n"
        + "           (SAMPLE(?typeLabel) AS ?typeLabelResult)\n"
        + "           "
        + selects
        + "\n"
        + "    WHERE {\n"
        + sparql_where
        + "    }\n"
        + "    GROUP BY ?s ?label ?lat ?long ?type\n"
    )
