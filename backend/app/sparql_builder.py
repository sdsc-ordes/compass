"""
SPARQL query builder for the entities endpoint.

The main entry point is build_entities_query(), which assembles a full SPARQL
SELECT query from SHACL property specs and the current request query params.

Helper functions are grouped by concern:
  - to_prefixed / build_optional / build_select_expr: per-property SPARQL fragments
  - _sparql_preamble / _special_optionals / _special_selects: fixed query sections
  - _union_or_single / _build_where_clauses: dynamic filter application
"""
from typing import Any, Dict, List

from .namespaces import PREFIX_MAP, SPARQL_PREFIXES


def to_prefixed(iri: str) -> str:
    """Convert a full IRI to a SPARQL prefixed name (e.g. ocorg:country)."""
    for ns, prefix in PREFIX_MAP.items():
        if iri.startswith(ns):
            return prefix + iri[len(ns):]
    return f"<{iri}>"


def build_optional(spec: dict, lang: str) -> str:
    """Generate the SPARQL OPTIONAL clause for a single property spec."""
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
    """Generate the SPARQL SELECT expression (GROUP_CONCAT or SAMPLE) for a property spec."""
    sid = spec["id"]
    cat = spec["category"]
    is_multi = spec["is_multi"]

    if cat == "iri_with_label":
        if is_multi:
            return (
                f'(GROUP_CONCAT(DISTINCT CONCAT(STR(?{sid}Node), "|", '
                f'COALESCE(?{sid}Lab, "")); separator=";;") AS ?{sid}Raw)'
            )
        return (
            f'(SAMPLE(?{sid}Node) AS ?{sid}Iri)\n'
            f'           (SAMPLE(?{sid}Lab) AS ?{sid}Label)'
        )
    if is_multi:
        return f'(GROUP_CONCAT(DISTINCT ?{sid}; separator=";;") AS ?{sid}Raw)'
    return f'(SAMPLE(?{sid}) AS ?{sid}Result)'


# ---------------------------------------------------------------------------
# Fixed query sections
# ---------------------------------------------------------------------------

def _sparql_preamble(lang: str) -> str:
    """Fixed WHERE preamble covering type resolution, geometry, and name binding."""
    return f"""
        {{
            ?s a ?type .
            ?type rdfs:subClassOf* ocorg:Organization .
        }} UNION {{
            ?s a ocorg:Network .
            BIND(ocorg:Network AS ?type)
        }} UNION {{
            ?s a ocorg:InternationalForum .
            BIND(ocorg:InternationalForum AS ?type)
        }} UNION {{
            ?s a ocorg:Project .
            BIND(ocorg:Project AS ?type)
        }}
        ?s geo:lat ?lat .
        ?s geo:long ?long .
        OPTIONAL {{ ?s ocorg:organizationName ?orgName . FILTER(lang(?orgName) = "{lang}") }}
        OPTIONAL {{ ?s ocorg:projectName ?projNameVar . FILTER(lang(?projNameVar) = "{lang}") }}
        BIND(COALESCE(?orgName, ?projNameVar) AS ?label)
        FILTER(BOUND(?label))
        OPTIONAL {{ ?type rdfs:label ?typeLabel . FILTER(lang(?typeLabel) = "{lang}") }}
"""


def _special_optionals(lang: str) -> str:
    """OPTIONAL clauses for nested/cross-shape properties (projects, network/forum fields)."""
    return f"""
        OPTIONAL {{
            ?s ocorg:hasProject ?project .
            ?project ocorg:projectName ?projName .
            FILTER(lang(?projName) = "{lang}")
            OPTIONAL {{ ?project ocorg:startDate ?projStart . }}
            OPTIONAL {{ ?project ocorg:endDate ?projEnd . }}
            OPTIONAL {{ ?project ocorg:imageUrl ?projImage . }}
            OPTIONAL {{ ?project ocorg:projectUrl ?projUrl . }}
            OPTIONAL {{ ?project ocorg:species ?projSpecies . FILTER(lang(?projSpecies) = "en") }}
        }}
        OPTIONAL {{ ?s ocorg:memberCount ?memberCount . }}
        OPTIONAL {{ ?s ocorg:memberStates ?memberStates . }}
        OPTIONAL {{ ?s ocorg:mandate ?mandate . FILTER(lang(?mandate) = "{lang}") }}
        OPTIONAL {{ ?s ocorg:startDate ?selfStartDate . }}
        OPTIONAL {{ ?s ocorg:endDate ?selfEndDate . }}
        OPTIONAL {{ ?s ocorg:imageUrl ?selfImageUrl . }}
        OPTIONAL {{ ?s ocorg:projectUrl ?selfProjUrl . }}
        OPTIONAL {{ ?s ocorg:species ?selfSpecies . }}
"""


def _special_selects() -> str:
    """SELECT expressions for nested/cross-shape variables (projects, species, network fields)."""
    return (
        '           (GROUP_CONCAT(DISTINCT CONCAT(COALESCE(?projName, ""), "|",'
        ' COALESCE(STR(?projStart), ""), "|", COALESCE(STR(?projEnd), ""), "|",'
        ' COALESCE(STR(?projImage), ""), "|", COALESCE(STR(?projUrl), ""), "|",'
        ' COALESCE(STR(?project), "")); separator=";;") AS ?projectsRaw)\n'
        '           (GROUP_CONCAT(DISTINCT STR(?projSpecies); separator=";;") AS ?speciesRaw)\n'
        '           (GROUP_CONCAT(DISTINCT STR(?project); separator=";;") AS ?linkedProjectIris)\n'
        '           (SAMPLE(?memberCount) AS ?memberCountResult)\n'
        '           (SAMPLE(?memberStates) AS ?memberStatesResult)\n'
        '           (SAMPLE(?mandate) AS ?mandateResult)\n'
        '           (SAMPLE(?selfStartDate) AS ?selfStart)\n'
        '           (SAMPLE(?selfEndDate) AS ?selfEnd)\n'
        '           (SAMPLE(?selfImageUrl) AS ?selfImage)\n'
        '           (SAMPLE(?selfProjUrl) AS ?selfPUrl)\n'
        '           (GROUP_CONCAT(DISTINCT STR(?selfSpecies); separator=";;") AS ?selfSpeciesRaw)\n'
    )


# ---------------------------------------------------------------------------
# Dynamic WHERE clause construction from request query params
# ---------------------------------------------------------------------------

def _union_or_single(parts: List[str]) -> str:
    """Wrap multiple filter parts in UNION blocks, or return the single part as-is."""
    if len(parts) > 1:
        return "{ " + " } UNION { ".join(parts) + " }"
    return parts[0]


def _build_where_clauses(
    query_params,
    filter_map: Dict[str, str],
    range_filters: Dict[str, str],
    date_filters: Dict[str, str],
) -> List[str]:
    """Convert request query params into SPARQL WHERE clause fragments."""
    where_clauses = []

    for key, val in query_params.items():
        if key == "lang" or not val:
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

        elif key == "species":
            parts = []
            for v in values:
                safe_v = v.replace('\\', '\\\\').replace('"', '\\"')
                parts.append(
                    f'?s ocorg:hasProject ?speciesProj . '
                    f'?speciesProj ocorg:species ?speciesVal . '
                    f'FILTER(str(?speciesVal) = "{safe_v}")'
                )
            if parts:
                where_clauses.append(_union_or_single(parts))

        elif key in date_filters:
            safe_v = val.replace('\\', '\\\\').replace('"', '\\"')
            prop = date_filters[key]
            where_clauses.append(
                f'?s {prop} ?{key}Val . FILTER(?{key}Val >= "{safe_v}"^^xsd:date)'
            )

        elif key == "entityType":
            iri_list = ", ".join(
                f"<{v}>" for v in values if v.startswith("http") and ">" not in v
            )
            if iri_list:
                where_clauses.append(f"FILTER(?type IN ({iri_list}))")

        elif key in range_filters:
            prop = range_filters[key]
            try:
                numeric_val = float(val)
                where_clauses.append(
                    f"?s {prop} ?{key}Val . FILTER(?{key}Val >= {numeric_val})"
                )
            except ValueError:
                continue

    return where_clauses


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def build_entities_query(
    specs: List[Dict[str, Any]], lang: str, query_params
) -> str:
    """Assemble the full SPARQL SELECT query for the entities endpoint.

    Args:
        specs: Property specs from RDFStore.get_property_specs().
        lang: Requested language code (e.g. "en", "de").
        query_params: Starlette QueryParams from the current request.

    Returns:
        A complete SPARQL SELECT query string.
    """
    filter_map: Dict[str, str] = {}
    range_filters: Dict[str, str] = {}
    date_filters: Dict[str, str] = {}
    for spec in specs:
        prefixed = to_prefixed(spec["path_iri"])
        if spec["filter_type"] == "multiselect":
            filter_map[spec["id"]] = prefixed
        elif spec["filter_type"] == "slider":
            range_filters[spec["id"]] = prefixed
        elif spec["filter_type"] == "datepicker":
            date_filters[spec["id"]] = prefixed

    preamble = _sparql_preamble(lang)
    auto_optionals = "\n        ".join(build_optional(spec, lang) for spec in specs)
    auto_selects = "\n           ".join(build_select_expr(spec) for spec in specs)
    where_clauses = _build_where_clauses(query_params, filter_map, range_filters, date_filters)

    sparql_where = preamble + "        " + auto_optionals + "\n" + _special_optionals(lang)
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
