"""SPARQL generation from SHACL property specs plus the active filters."""
from typing import Any, Dict, List, Optional

from .namespaces import PREFIX_MAP, SPARQL_PREFIXES, ITEM_SEP, FIELD_SEP


def to_prefixed(iri: str) -> str:
    """Convert a full IRI to a SPARQL prefixed name (e.g. compass:country)."""
    for ns, prefix in PREFIX_MAP.items():
        if iri.startswith(ns):
            return prefix + iri[len(ns):]
    return f"<{iri}>"


def build_optional(spec: dict, lang: str) -> str:
    sid = spec["id"]
    path = to_prefixed(spec["path_iri"])
    cat = spec["category"]

    if cat == "lang_literal":
        return f'OPTIONAL {{ ?s {path} ?{sid} . FILTER(lang(?{sid}) = "{lang}") }}'
    if cat in ("simple_literal", "uri_literal", "boolean"):
        return f'OPTIONAL {{ ?s {path} ?{sid} . }}'
    if cat == "iri_with_label":
        return (
            f'OPTIONAL {{\n'
            f'            ?s {path} ?{sid}Node .\n'
            f'            OPTIONAL {{ ?{sid}Node skos:prefLabel ?{sid}Skos . FILTER(lang(?{sid}Skos) = "{lang}") }}\n'
            f'            OPTIONAL {{ ?{sid}Node rdfs:label ?{sid}Rdfs . FILTER(lang(?{sid}Rdfs) = "{lang}") }}\n'
            f'            BIND(COALESCE(?{sid}Skos, ?{sid}Rdfs) AS ?{sid}Lab)\n'
            f'        }}'
        )
    return ""


def build_select_expr(spec: dict) -> str:
    """GROUP_CONCAT for multi-valued properties, SAMPLE for single-valued ones."""
    sid = spec["id"]
    cat = spec["category"]
    is_multi = spec["is_multi"]

    if cat == "iri_with_label":
        if is_multi:
            return (
                f'(GROUP_CONCAT(DISTINCT CONCAT(STR(?{sid}Node), "{FIELD_SEP}", '
                f'COALESCE(?{sid}Lab, "")); separator="{ITEM_SEP}") AS ?{sid}Raw)'
            )
        return (
            f'(SAMPLE(?{sid}Node) AS ?{sid}Iri)\n'
            f'           (SAMPLE(?{sid}Lab) AS ?{sid}Label)'
        )
    if is_multi:
        return f'(GROUP_CONCAT(DISTINCT ?{sid}; separator="{ITEM_SEP}") AS ?{sid}Raw)'
    return f'(SAMPLE(?{sid}) AS ?{sid}Result)'


def _sparql_preamble(lang: str) -> str:
    """Type resolution, geometry and label binding, shared by both queries.

    The four entity classes carry coordinates and a compass:name. Country/Area
    concepts are additionally surfaced as map *regions*: they have no coordinates
    and label themselves with skos:prefLabel, so geometry is OPTIONAL and the
    label is COALESCEd across both naming properties.
    """
    return f"""
        {{
            ?s a compass:InternationalForum .
            BIND(compass:InternationalForum AS ?type)
        }} UNION {{
            ?s a compass:Network .
            BIND(compass:Network AS ?type)
        }} UNION {{
            ?s a compass:Project .
            BIND(compass:Project AS ?type)
        }} UNION {{
            ?s a compass:PartnerOrganization .
            BIND(compass:PartnerOrganization AS ?type)
        }} UNION {{
            ?s a compass:CountryArea .
            BIND(compass:CountryArea AS ?type)
        }}
        OPTIONAL {{ ?s geo:lat ?lat . }}
        OPTIONAL {{ ?s geo:long ?long . }}
        OPTIONAL {{ ?s compass:name ?nameLabel . FILTER(lang(?nameLabel) = "{lang}") }}
        OPTIONAL {{ ?s skos:prefLabel ?prefLabel . FILTER(lang(?prefLabel) = "{lang}") }}
        BIND(COALESCE(?nameLabel, ?prefLabel) AS ?label)
        FILTER(BOUND(?label))
        OPTIONAL {{ ?type rdfs:label ?typeLabel . FILTER(lang(?typeLabel) = "{lang}") }}
"""


def _special_optionals() -> str:
    """Properties fetched for display that no entity NodeShape declares."""
    return """
        OPTIONAL { ?s compass:startDate ?selfStart . }
        OPTIONAL { ?s compass:endDate ?selfEnd . }
        OPTIONAL { ?s compass:wpEntityTagIdEn ?wpEntityTagIdEn . }
        OPTIONAL { ?s compass:wpEntityTagIdDe ?wpEntityTagIdDe . }
"""


def _special_selects() -> str:
    return (
        '           (SAMPLE(?selfStart) AS ?selfStart)\n'
        '           (SAMPLE(?selfEnd) AS ?selfEnd)\n'
        '           (SAMPLE(?wpEntityTagIdEn) AS ?wpEntityTagIdEn)\n'
        '           (SAMPLE(?wpEntityTagIdDe) AS ?wpEntityTagIdDe)\n'
    )


def _union_or_single(parts: List[str]) -> str:
    if len(parts) > 1:
        return "{ " + " } UNION { ".join(parts) + " }"
    return parts[0]


def _build_where_clauses(
    query_params,
    filter_map: Dict[str, str],
    range_filters: Dict[str, str],
    date_filters: Dict[str, str],
    exclude_key: Optional[str] = None,
) -> List[str]:
    """exclude_key drops that dimension's own constraints, so facet counts for a
    dimension are not shrunk by the selection within it (drill-down faceting)."""
    where_clauses = []

    for key, val in query_params.items():
        if key == "lang" or key == exclude_key or not val:
            continue
        values = query_params.getlist(key)

        if key in filter_map:
            prop = filter_map[key]
            parts = []
            for v in values:
                if v.startswith("http") and ">" not in v:
                    parts.append(f"?s {prop} <{v}> .")
                else:
                    safe_v = v.replace('\\', '\\\\').replace('"', '\\"')
                    parts.append(f'?s {prop} ?{key}Val . FILTER(str(?{key}Val) = "{safe_v}")')
            if parts:
                where_clauses.append(_union_or_single(parts))

        elif key in date_filters:
            safe_v = val.replace('\\', '\\\\').replace('"', '\\"')
            prop = date_filters[key]
            where_clauses.append(
                f'OPTIONAL {{ ?s {prop} ?{key}Val . }} '
                f'FILTER(!BOUND(?{key}Val) || ?{key}Val >= "{safe_v}"^^xsd:date)'
            )

        elif key == "entityType":
            iri_list = ", ".join(
                f"<{v}>" for v in values if v.startswith("http") and ">" not in v
            )
            if iri_list:
                # Regions (CountryArea) are a separate visual layer and stay
                # visible regardless of the entity-type (pin) filter.
                where_clauses.append(
                    f"FILTER(?type IN ({iri_list}) || ?type = compass:CountryArea)"
                )

        elif key in range_filters:
            prop, datatype = range_filters[key]
            try:
                numeric_val = float(val)
                if datatype and "gYear" in datatype:
                    year_int = int(numeric_val)
                    where_clauses.append(
                        f'OPTIONAL {{ ?s {prop} ?{key}Val . }} '
                        f'FILTER(!BOUND(?{key}Val) || ?{key}Val >= "{year_int}"^^xsd:gYear)'
                    )
                else:
                    where_clauses.append(
                        f'OPTIONAL {{ ?s {prop} ?{key}Val . }} '
                        f'FILTER(!BOUND(?{key}Val) || ?{key}Val >= {numeric_val})'
                    )
            except ValueError:
                continue

    return where_clauses


def _categorize_specs(specs: List[Dict[str, Any]]):
    filter_map: Dict[str, str] = {}
    range_filters: Dict[str, str] = {}
    date_filters: Dict[str, str] = {}
    for spec in specs:
        prefixed = to_prefixed(spec["path_iri"])
        if spec["filter_type"] in ("multiselect", "toggle"):
            filter_map[spec["id"]] = prefixed
        elif spec["filter_type"] == "slider":
            range_filters[spec["id"]] = (prefixed, spec.get("datatype"))
        elif spec["filter_type"] == "datepicker":
            date_filters[spec["id"]] = prefixed
    return filter_map, range_filters, date_filters


def build_facet_query(
    specs: List[Dict[str, Any]], lang: str, query_params, target_id: str
) -> str:
    """Count entities per value of one tag dimension.

    The preamble is shared with build_entities_query so ?s ranges over exactly
    the same entity set the map renders.
    """
    filter_map, range_filters, date_filters = _categorize_specs(specs)
    target_path = filter_map[target_id]

    preamble = _sparql_preamble(lang)
    where_clauses = _build_where_clauses(
        query_params, filter_map, range_filters, date_filters, exclude_key=target_id
    )

    # Country/Area regions are background context, not results (see the map's
    # result badge, which counts point features only) — exclude them so facet
    # counts match what the map reports.
    sparql_where = preamble + f"        ?s {target_path} ?val .\n"
    sparql_where += "        FILTER(?type != compass:CountryArea)\n"
    if where_clauses:
        sparql_where += "        " + "\n        ".join(where_clauses) + "\n"

    return (
        SPARQL_PREFIXES
        + "    SELECT ?val (COUNT(DISTINCT ?s) AS ?n)\n"
        + "    WHERE {\n" + sparql_where + "    }\n"
        + "    GROUP BY ?val\n"
    )


def build_entities_query(
    specs: List[Dict[str, Any]], lang: str, query_params
) -> str:
    filter_map, range_filters, date_filters = _categorize_specs(specs)

    preamble = _sparql_preamble(lang)
    auto_optionals = "\n        ".join(build_optional(spec, lang) for spec in specs)
    auto_selects = "\n           ".join(build_select_expr(spec) for spec in specs)
    where_clauses = _build_where_clauses(query_params, filter_map, range_filters, date_filters)

    sparql_where = preamble + "        " + auto_optionals + "\n" + _special_optionals()
    if where_clauses:
        sparql_where += "        " + "\n        ".join(where_clauses) + "\n"

    return (
        SPARQL_PREFIXES
        + "    SELECT ?s ?label ?lat ?long ?type\n"
        + "           (SAMPLE(?typeLabel) AS ?typeLabelResult)\n"
        + "           " + auto_selects + "\n"
        + _special_selects()
        + "    WHERE {\n" + sparql_where + "    }\n"
        + "    GROUP BY ?s ?label ?lat ?long ?type\n"
    )
