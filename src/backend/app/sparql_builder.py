"""SPARQL generation from EntityShape descriptors plus the active filters."""

from __future__ import annotations

from datetime import date
from typing import Any

from app.namespaces import (
    ALWAYS_ON_CLASSES,
    FIELD_SEP,
    ITEM_SEP,
    PIN_CLASSES,
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
    for ns, prefix in PREFIX_MAP.items():
        if iri.startswith(ns):
            return prefix + iri[len(ns) :]
    return iri_term(iri)


def _is_iri_value(value: str) -> bool:
    """True when a filter value names a concept rather than a literal tag.

    A tag dimension can be filtered either by concept IRI or by literal text,
    so the two are told apart by shape. The IRI check is the grammar's, not a
    guess: a value that cannot be written as an IRIREF is treated as a literal
    rather than interpolated between brackets.

    Args:
        value: Raw query-parameter value.

    Returns:
        Whether *value* is a safe absolute HTTP(S) IRI.
    """
    return value.startswith(("http://", "https://")) and is_iri(value)


def build_optional(spec: EntityShape, lang: str) -> str:
    """Build the OPTIONAL clause that binds one EntityShape property.

    Args:
        spec: Property descriptor from SHACL.
        lang: Preferred language for labels / langString filters.

    Returns:
        SPARQL OPTIONAL fragment, or empty string for unknown categories.
    """
    sid = spec.id
    path = to_prefixed(spec.path_iri)
    cat = spec.category

    if cat == "lang_literal":
        return f'OPTIONAL {{ ?s {path} ?{sid} . FILTER(lang(?{sid}) = "{lang}") }}'
    if cat in ("simple_literal", "uri_literal", "boolean"):
        return f"OPTIONAL {{ ?s {path} ?{sid} . }}"
    if cat == "iri_with_label":
        return (
            f"OPTIONAL {{\n"
            f"            ?s {path} ?{sid}Node .\n"
            f"            OPTIONAL {{ ?{sid}Node skos:prefLabel ?{sid}Skos . "
            f'FILTER(lang(?{sid}Skos) = "{lang}") }}\n'
            f"            OPTIONAL {{ ?{sid}Node rdfs:label ?{sid}Rdfs . "
            f'FILTER(lang(?{sid}Rdfs) = "{lang}") }}\n'
            f"            BIND(COALESCE(?{sid}Skos, ?{sid}Rdfs) AS ?{sid}Lab)\n"
            f"        }}"
        )
    return ""


def build_select_expr(spec: EntityShape) -> str:
    """GROUP_CONCAT for multi-valued properties, SAMPLE for single-valued ones.

    Args:
        spec: Property descriptor from SHACL.

    Returns:
        SELECT projection expression(s) for this property.
    """
    sid = spec.id
    cat = spec.category
    is_multi = spec.is_multi

    if cat == "iri_with_label":
        if is_multi:
            return (
                f'(GROUP_CONCAT(DISTINCT CONCAT(STR(?{sid}Node), "{FIELD_SEP}", '
                f'COALESCE(?{sid}Lab, "")); separator="{ITEM_SEP}") AS ?{sid}Raw)'
            )
        return (
            f"(SAMPLE(?{sid}Node) AS ?{sid}Iri)\n"
            f"           (SAMPLE(?{sid}Lab) AS ?{sid}Label)"
        )
    if is_multi:
        return f'(GROUP_CONCAT(DISTINCT ?{sid}; separator="{ITEM_SEP}") AS ?{sid}Raw)'
    return f"(SAMPLE(?{sid}) AS ?{sid}Result)"


# The synthetic dimension over rdf:type. shacl_to_filters builds its widget and
# _build_where_clauses filters on it; neither reaches it through a property shape.
ENTITY_TYPE_ID = "entityType"


# The one subject every clause constrains: the pin the map draws.
PIN_VAR = "?s"
TYPE_VAR = "?type"


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


def _pin_branch(
    where_clauses: list[str], indent: str = "        ", *, with_always_on: bool = False
) -> str:
    """Build the UNION of the entity classes that carry coordinates.

    Args:
        where_clauses: Extra FILTER / pattern lines applied to each filtered pin.
        indent: Leading whitespace for generated lines.
        with_always_on: Also emit ``ALWAYS_ON_CLASSES``, outside the filtered
            group so no clause reaches them. Off for facet counts, which report
            how many *results* a tag would leave.

    Returns:
        SPARQL WHERE fragment for map pins.
    """
    inner = indent + "    " if with_always_on else indent
    body = f"{inner}{_class_union(PIN_CLASSES, inner)}\n"
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
    """Geometry and label binding for every pin.

    Coordinates stay OPTIONAL so a pin missing them reaches the decoder, which
    logs it, rather than dropping out of the query unremarked. A pin with no
    name in the requested language drops out, exactly as it would on the map.

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


def _distinct(values: list[str]) -> list[str]:
    """Drop empties and repeats from a dimension's selected values, in order.

    A repeated value would compile to a second identical required pattern,
    which constrains nothing and only makes the query longer.

    Args:
        values: Raw query-parameter values for one dimension.

    Returns:
        The non-empty values, first occurrence order preserved.
    """
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            out.append(value)
    return out


def _build_where_clauses(
    query_params: Any,
    filter_map: dict[str, str],
    range_filters: RangeFilters,
    date_filters: dict[str, str],
    *,
    exclude_key: str | None = None,
) -> list[str]:
    """Translate HTTP query params into SPARQL WHERE fragments.

    Values picked within one tag dimension are conjunctive: each becomes its own
    required triple pattern, so picking a second value narrows the selection.
    Dimensions are conjunctive with each other for the same reason -- every
    clause lands in the same group. ``entityType`` is the exception and stays
    disjunctive: an entity has exactly one class, so requiring two would return
    nothing (see the ``FILTER(... IN ...)`` branch below).

    ``exclude_key`` drops that dimension's own constraints. It is the drill-down
    device for a disjunctive dimension, whose unpicked values would otherwise all
    count zero; a conjunctive dimension wants its own selection kept, so
    ``build_facet_query`` passes this only for ``entityType``.

    Args:
        query_params: Starlette/FastAPI query parameter multi-dict.
        filter_map: Multiselect/toggle property id → prefixed predicate.
        range_filters: Slider property id → (predicate, datatype).
        date_filters: Datepicker property id → prefixed predicate.
        exclude_key: Dimension id to ignore (disjunctive-dimension faceting).

    Returns:
        List of SPARQL pattern / FILTER lines.
    """
    where_clauses = []
    subj = PIN_VAR

    for key, val in query_params.items():
        if key in ("lang", exclude_key) or not val:
            continue
        values = query_params.getlist(key)
        var = f"?{key}Val"

        if key in filter_map:
            prop = filter_map[key]
            # Every picked value is its own required pattern, so a second pick
            # narrows the selection instead of widening it: "dolphins AND
            # whales" means the entities that carry both tags. The literal
            # branch needs a fresh variable per value -- one variable cannot
            # equal two different literals at once, and reusing it would match
            # nothing.
            for index, v in enumerate(_distinct(values)):
                if _is_iri_value(v):
                    where_clauses.append(f"{subj} {prop} {iri_term(v)} .")
                else:
                    val_var = f"{var}{index}"
                    where_clauses.append(
                        f"{subj} {prop} {val_var} . "
                        f"FILTER(str({val_var}) = {string_literal(v)})"
                    )

        elif key in date_filters:
            try:
                date.fromisoformat(val)
            except ValueError:
                continue  # not a date, so it constrains nothing
            prop = date_filters[key]
            where_clauses.append(
                f"OPTIONAL {{ {subj} {prop} {var} . }} "
                f"FILTER(!BOUND({var}) || {var} >= {string_literal(val)}^^xsd:date)"
            )

        elif key == ENTITY_TYPE_ID:
            iri_list = ", ".join(iri_term(v) for v in values if _is_iri_value(v))
            if iri_list:
                # Disjunctive on purpose, unlike the tag dimensions above: an
                # entity has exactly one rdf:type, so requiring two picked
                # classes at once would empty the map. Picking Programme and
                # Network means "either".
                where_clauses.append(f"FILTER({TYPE_VAR} IN ({iri_list}))")

        elif key in range_filters:
            prop, datatype = range_filters[key]
            try:
                numeric_val = float(val)
                if datatype and "gYear" in datatype:
                    year_int = int(numeric_val)
                    where_clauses.append(
                        f"OPTIONAL {{ {subj} {prop} {var} . }} "
                        f'FILTER(!BOUND({var}) || {var} >= "{year_int}"^^xsd:gYear)'
                    )
                else:
                    where_clauses.append(
                        f"OPTIONAL {{ {subj} {prop} {var} . }} "
                        f"FILTER(!BOUND({var}) || {var} >= {numeric_val})"
                    )
            except ValueError:
                continue

    return where_clauses


def _categorize_specs(
    specs: list[EntityShape],
) -> tuple[dict[str, str], RangeFilters, dict[str, str]]:
    """Split EntityShape list into multiselect, range, and date filter maps.

    Args:
        specs: SHACL-projected property descriptors.

    Returns:
        Tuple of ``(filter_map, range_filters, date_filters)``.
    """
    filter_map: dict[str, str] = {}
    range_filters: RangeFilters = {}
    date_filters: dict[str, str] = {}
    for spec in specs:
        prefixed = to_prefixed(spec.path_iri)
        if spec.filter_type in ("multiselect", "toggle"):
            filter_map[spec.id] = prefixed
        elif spec.filter_type == "slider":
            range_filters[spec.id] = (prefixed, spec.datatype)
        elif spec.filter_type == "datepicker":
            date_filters[spec.id] = prefixed
    return filter_map, range_filters, date_filters


def build_facet_query(
    specs: list[EntityShape], lang: str, query_params: Any, target_id: str
) -> str:
    """Count entities per value of one tag dimension.

    A count reads "how many results if I also pick this". For a conjunctive tag
    dimension that means the dimension's own selection stays in the query: a
    second pick genuinely does shrink what is left reachable beside it, and the
    count for an already-picked value is simply the current result total. Values
    that would empty the map drop out of the results entirely, which is what the
    panel dims.

    ``entityType`` is the one disjunctive dimension, so it keeps the old
    drill-down: its own picks are excluded, or every class the user has not
    picked would count zero and look unpickable.

    Args:
        specs: EntityShape list for the ontology.
        lang: Preferred language for shared optionals.
        query_params: Active filter query parameters.
        target_id: Dimension whose values are counted.

    Returns:
        Complete SPARQL SELECT counting ``?val``.
    """
    filter_map, range_filters, date_filters = _categorize_specs(specs)

    exclude_key = target_id if target_id == ENTITY_TYPE_ID else None
    where_clauses = _build_where_clauses(
        query_params, filter_map, range_filters, date_filters, exclude_key=exclude_key
    )

    sparql_where = _pin_branch(where_clauses)
    # entityType has no property shape and so no path in filter_map: it is the
    # class that _pin_branch has already BOUND to ?type in every branch, so the
    # count groups by that variable rather than by a triple's object. Aliasing it
    # to ?val keeps one result shape for the caller; ?val cannot be aliased to
    # itself, which is why the ordinary path selects it bare.
    if target_id == ENTITY_TYPE_ID:
        selected, grouped = f"({TYPE_VAR} AS ?val)", TYPE_VAR
    else:
        selected, grouped = "?val", "?val"
        sparql_where += f"        ?s {filter_map[target_id]} ?val .\n"
    sparql_where += _shared_optionals(lang)

    return (
        SPARQL_PREFIXES
        + f"    SELECT {selected} (COUNT(DISTINCT ?s) AS ?n)\n"
        + "    WHERE {\n"
        + sparql_where
        + "    }\n"
        + f"    GROUP BY {grouped}\n"
    )


def sparql_for_instances(specs: list[EntityShape], lang: str, query_params: Any) -> str:
    """Compile the main entity SELECT for the map.

    Args:
        specs: EntityShape list for the ontology.
        lang: Preferred language.
        query_params: Active filter query parameters.

    Returns:
        Complete SPARQL SELECT returning one grouped row per entity.
    """
    filter_map, range_filters, date_filters = _categorize_specs(specs)

    auto_optionals = "\n        ".join(build_optional(spec, lang) for spec in specs)
    auto_selects = "\n           ".join(build_select_expr(spec) for spec in specs)
    pin_clauses = _build_where_clauses(
        query_params, filter_map, range_filters, date_filters
    )

    sparql_where = _pin_branch(pin_clauses, with_always_on=True)
    sparql_where += _shared_optionals(lang)
    sparql_where += "        " + auto_optionals + "\n"

    return (
        SPARQL_PREFIXES
        + "    SELECT ?s ?label ?lat ?long ?type\n"
        + "           (SAMPLE(?typeLabel) AS ?typeLabelResult)\n"
        + "           "
        + auto_selects
        + "\n"
        + "    WHERE {\n"
        + sparql_where
        + "    }\n"
        + "    GROUP BY ?s ?label ?lat ?long ?type\n"
    )
