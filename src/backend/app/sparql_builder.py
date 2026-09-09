"""SPARQL generation from EntityShape descriptors plus the active filters."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from .namespaces import FIELD_SEP, ITEM_SEP, PREFIX_MAP, SPARQL_PREFIXES
from .shacl_to_entities import EntityShape
from .sparql_terms import iri_term, is_iri, string_literal

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


PIN_CLASSES = ("InternationalForum", "Network", "Project", "PartnerOrganization")


@dataclass(frozen=True)
class Subject:
    """Which variable a set of filter clauses constrains.

    Filters read the same for a pin the map draws and for the pin that puts a
    region on the map, but they cannot share variable names: the region branch
    nests its copy inside FILTER EXISTS, where the outer ``?type`` is already
    bound to ``compass:CountryArea``.

    Attributes:
        var: Subject variable (e.g. ``?s`` or ``?pin``).
        type_var: Variable holding the entity class IRI.
        suffix: Keeps helper variables distinct across the two copies.
        declare_type: Bind ``type_var`` here rather than relying on an outer BIND.
    """

    var: str
    type_var: str
    suffix: str
    declare_type: bool


PIN = Subject(var="?s", type_var="?type", suffix="", declare_type=False)
REGION_PIN = Subject(var="?pin", type_var="?pinType", suffix="Pin", declare_type=True)


def _pin_branch(where_clauses: list[str], indent: str = "        ") -> str:
    """Build the UNION of the four entity classes that carry coordinates.

    Args:
        where_clauses: Extra FILTER / pattern lines applied to each pin.
        indent: Leading whitespace for generated lines.

    Returns:
        SPARQL WHERE fragment for map pins.
    """
    branches = f"\n{indent}UNION ".join(
        f"{{ ?s a compass:{name} . BIND(compass:{name} AS ?type) }}" for name in PIN_CLASSES
    )
    body = f"{indent}{branches}\n"
    if where_clauses:
        body += indent + f"\n{indent}".join(where_clauses) + "\n"
    return body


def _region_branch(where_clauses: list[str], indent: str = "        ") -> str:
    """Build the Country/Area branch reachable only through a matching pin.

    A region is a shaded polygon rather than a result, and it carries no tags of
    its own: it reaches the map because some pin passing the same filters
    records it, so shading always means "matching pins are in here".

    Args:
        where_clauses: Filter clauses applied to the nested ``?pin``.
        indent: Leading whitespace for generated lines.

    Returns:
        SPARQL WHERE fragment for shaded regions.
    """
    inner = f"{indent}    ?pin compass:countryArea ?s .\n"
    if where_clauses:
        inner += indent + "    " + f"\n{indent}    ".join(where_clauses) + "\n"
    return (
        f"{indent}?s a compass:CountryArea .\n"
        f"{indent}BIND(compass:CountryArea AS ?type)\n"
        f"{indent}FILTER EXISTS {{\n{inner}{indent}}}\n"
    )


def _shared_optionals(lang: str) -> str:
    """Geometry and label binding, applied to pins and regions alike.

    Regions have no coordinates and label themselves with skos:prefLabel, so
    geometry is OPTIONAL and the label is COALESCEd across both properties.

    Args:
        lang: Preferred language tag.

    Returns:
        SPARQL OPTIONAL / BIND / FILTER block.
    """
    return f"""        OPTIONAL {{ ?s geo:lat ?lat . }}
        OPTIONAL {{ ?s geo:long ?long . }}
        OPTIONAL {{ ?s compass:name ?nameLabel . FILTER(lang(?nameLabel) = "{lang}") }}
        OPTIONAL {{ ?s skos:prefLabel ?prefLabel . FILTER(lang(?prefLabel) = "{lang}") }}
        BIND(COALESCE(?nameLabel, ?prefLabel) AS ?label)
        FILTER(BOUND(?label))
        OPTIONAL {{ ?type rdfs:label ?typeLabel . FILTER(lang(?typeLabel) = "{lang}") }}
"""


def _special_optionals() -> str:
    """Return OPTIONAL patterns for properties not declared on entity NodeShapes.

    Returns:
        SPARQL fragment fetching ``compass:wpEntityTagId``.
    """
    return """
        OPTIONAL { ?s compass:wpEntityTagId ?wpEntityTagId . }
"""


def _special_selects() -> str:
    """Return SELECT projections for special (non-SHACL) properties.

    Returns:
        SPARQL SELECT fragment for ``wpEntityTagId``.
    """
    return "           (SAMPLE(?wpEntityTagId) AS ?wpEntityTagId)\n"


def _union_or_single(parts: list[str]) -> str:
    """Join alternative graph patterns with UNION, or return the sole pattern.

    Args:
        parts: Individual pattern strings.

    Returns:
        A single pattern or a braced UNION of several.
    """
    if len(parts) > 1:
        return "{ " + " } UNION { ".join(parts) + " }"
    return parts[0]


def _build_where_clauses(
    query_params: Any,
    filter_map: dict[str, str],
    range_filters: RangeFilters,
    date_filters: dict[str, str],
    subject: Subject = PIN,
    exclude_key: str | None = None,
) -> list[str]:
    """Translate HTTP query params into SPARQL WHERE fragments.

    ``exclude_key`` drops that dimension's own constraints, so facet counts for a
    dimension are not shrunk by the selection within it (drill-down faceting).

    Args:
        query_params: Starlette/FastAPI query parameter multi-dict.
        filter_map: Multiselect/toggle property id → prefixed predicate.
        range_filters: Slider property id → (predicate, datatype).
        date_filters: Datepicker property id → prefixed predicate.
        subject: Variable naming for pin vs region-pin copies.
        exclude_key: Dimension id to ignore (faceting).

    Returns:
        List of SPARQL pattern / FILTER lines.
    """
    where_clauses = []
    subj = subject.var

    for key, val in query_params.items():
        if key in ("lang", exclude_key) or not val:
            continue
        values = query_params.getlist(key)
        var = f"?{key}{subject.suffix}Val"

        if key in filter_map:
            prop = filter_map[key]
            parts = []
            for v in values:
                if _is_iri_value(v):
                    parts.append(f"{subj} {prop} {iri_term(v)} .")
                else:
                    parts.append(
                        f"{subj} {prop} {var} . FILTER(str({var}) = {string_literal(v)})"
                    )
            if parts:
                where_clauses.append(_union_or_single(parts))

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

        elif key == "entityType":
            iri_list = ", ".join(iri_term(v) for v in values if _is_iri_value(v))
            if iri_list:
                # A region has no type of its own to filter, so the legend
                # reaches it through the pins: hide every Project and a region
                # holding only projects stops being shaded.
                clause = f"FILTER({subject.type_var} IN ({iri_list}))"
                if subject.declare_type:
                    clause = f"{subj} a {subject.type_var} . {clause}"
                where_clauses.append(clause)

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

    Regions are background context rather than results (see the map's result
    badge, which counts point features only), so only the pin branch is counted.

    Args:
        specs: EntityShape list for the ontology.
        lang: Preferred language for shared optionals.
        query_params: Active filter query parameters.
        target_id: Dimension whose values are counted.

    Returns:
        Complete SPARQL SELECT counting ``?val``.
    """
    filter_map, range_filters, date_filters = _categorize_specs(specs)
    target_path = filter_map[target_id]

    where_clauses = _build_where_clauses(
        query_params, filter_map, range_filters, date_filters, exclude_key=target_id
    )

    sparql_where = _pin_branch(where_clauses)
    sparql_where += f"        ?s {target_path} ?val .\n"
    sparql_where += _shared_optionals(lang)

    return (
        SPARQL_PREFIXES
        + "    SELECT ?val (COUNT(DISTINCT ?s) AS ?n)\n"
        + "    WHERE {\n"
        + sparql_where
        + "    }\n"
        + "    GROUP BY ?val\n"
    )


def sparql_for_instances(specs: list[EntityShape], lang: str, query_params: Any) -> str:
    """Compile the main entity SELECT (pins UNION regions) for the map.

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
    region_clauses = _build_where_clauses(
        query_params, filter_map, range_filters, date_filters, subject=REGION_PIN
    )

    sparql_where = (
        "        {\n"
        + _pin_branch(pin_clauses, "            ")
        + "        } UNION {\n"
        + _region_branch(region_clauses, "            ")
        + "        }\n"
    )
    sparql_where += _shared_optionals(lang)
    sparql_where += "        " + auto_optionals + "\n" + _special_optionals()

    return (
        SPARQL_PREFIXES
        + "    SELECT ?s ?label ?lat ?long ?type\n"
        + "           (SAMPLE(?typeLabel) AS ?typeLabelResult)\n"
        + "           "
        + auto_selects
        + "\n"
        + _special_selects()
        + "    WHERE {\n"
        + sparql_where
        + "    }\n"
        + "    GROUP BY ?s ?label ?lat ?long ?type\n"
    )
