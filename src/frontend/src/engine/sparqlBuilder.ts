/** SPARQL generation from the SHACL property specs plus the active filters. */
import { PREFIX_MAP, SPARQL_PREFIXES, ITEM_SEP, FIELD_SEP, type Spec, type Filters } from './namespaces';

/** dimension id -> selected values (each dimension applied once). */
export type ParamMap = Map<string, string[]>;

export function toParamMap(filters: Filters): ParamMap {
  const m: ParamMap = new Map();
  for (const [key, val] of Object.entries(filters)) {
    if (val === undefined) continue;
    const values = (Array.isArray(val) ? val : [val]).filter((v) => v !== undefined && v !== '');
    if (values.length) m.set(key, values.map(String));
  }
  return m;
}

/** Convert a full IRI to a SPARQL prefixed name (e.g. compass:country). */
export function toPrefixed(iri: string): string {
  for (const [ns, prefix] of Object.entries(PREFIX_MAP)) {
    if (iri.startsWith(ns)) return prefix + iri.slice(ns.length);
  }
  return `<${iri}>`;
}

export function buildOptional(spec: Spec, lang: string): string {
  const sid = spec.id;
  const path = toPrefixed(spec.path_iri);
  const cat = spec.category;

  if (cat === 'lang_literal') {
    return `OPTIONAL { ?s ${path} ?${sid} . FILTER(lang(?${sid}) = "${lang}") }`;
  }
  if (cat === 'simple_literal' || cat === 'uri_literal' || cat === 'boolean') {
    return `OPTIONAL { ?s ${path} ?${sid} . }`;
  }
  if (cat === 'iri_with_label') {
    return (
      `OPTIONAL {\n` +
      `            ?s ${path} ?${sid}Node .\n` +
      `            OPTIONAL { ?${sid}Node skos:prefLabel ?${sid}Skos . FILTER(lang(?${sid}Skos) = "${lang}") }\n` +
      `            OPTIONAL { ?${sid}Node rdfs:label ?${sid}Rdfs . FILTER(lang(?${sid}Rdfs) = "${lang}") }\n` +
      `            BIND(COALESCE(?${sid}Skos, ?${sid}Rdfs) AS ?${sid}Lab)\n` +
      `        }`
    );
  }
  return '';
}

/** GROUP_CONCAT for multi-valued properties, SAMPLE for single-valued ones. */
export function buildSelectExpr(spec: Spec): string {
  const sid = spec.id;
  const cat = spec.category;
  const isMulti = spec.is_multi;

  if (cat === 'iri_with_label') {
    if (isMulti) {
      return (
        `(GROUP_CONCAT(DISTINCT CONCAT(STR(?${sid}Node), "${FIELD_SEP}", ` +
        `COALESCE(?${sid}Lab, "")); separator="${ITEM_SEP}") AS ?${sid}Raw)`
      );
    }
    return `(SAMPLE(?${sid}Node) AS ?${sid}Iri)\n           (SAMPLE(?${sid}Lab) AS ?${sid}Label)`;
  }
  if (isMulti) {
    return `(GROUP_CONCAT(DISTINCT ?${sid}; separator="${ITEM_SEP}") AS ?${sid}Raw)`;
  }
  return `(SAMPLE(?${sid}) AS ?${sid}Result)`;
}

function sparqlPreamble(lang: string): string {
  return `
        {
            ?s a compass:InternationalForum .
            BIND(compass:InternationalForum AS ?type)
        } UNION {
            ?s a compass:Network .
            BIND(compass:Network AS ?type)
        } UNION {
            ?s a compass:Project .
            BIND(compass:Project AS ?type)
        } UNION {
            ?s a compass:PartnerOrganization .
            BIND(compass:PartnerOrganization AS ?type)
        } UNION {
            ?s a compass:CountryArea .
            BIND(compass:CountryArea AS ?type)
        }
        OPTIONAL { ?s geo:lat ?lat . }
        OPTIONAL { ?s geo:long ?long . }
        OPTIONAL { ?s compass:name ?nameLabel . FILTER(lang(?nameLabel) = "${lang}") }
        OPTIONAL { ?s skos:prefLabel ?prefLabel . FILTER(lang(?prefLabel) = "${lang}") }
        BIND(COALESCE(?nameLabel, ?prefLabel) AS ?label)
        FILTER(BOUND(?label))
        OPTIONAL { ?type rdfs:label ?typeLabel . FILTER(lang(?typeLabel) = "${lang}") }
`;
}

function specialOptionals(): string {
  return `
        OPTIONAL { ?s compass:startDate ?selfStart . }
        OPTIONAL { ?s compass:endDate ?selfEnd . }
        OPTIONAL { ?s compass:wpEntityTagIdEn ?wpEntityTagIdEn . }
        OPTIONAL { ?s compass:wpEntityTagIdDe ?wpEntityTagIdDe . }
`;
}

function specialSelects(): string {
  return (
    '           (SAMPLE(?selfStart) AS ?selfStart)\n' +
    '           (SAMPLE(?selfEnd) AS ?selfEnd)\n' +
    '           (SAMPLE(?wpEntityTagIdEn) AS ?wpEntityTagIdEn)\n' +
    '           (SAMPLE(?wpEntityTagIdDe) AS ?wpEntityTagIdDe)\n'
  );
}

function unionOrSingle(parts: string[]): string {
  if (parts.length > 1) return '{ ' + parts.join(' } UNION { ') + ' }';
  return parts[0];
}

function escapeLiteral(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildWhereClauses(
  params: ParamMap,
  filterMap: Map<string, string>,
  rangeFilters: Map<string, [string, string | null]>,
  dateFilters: Map<string, string>,
  excludeKey: string | null = null,
): string[] {
  const whereClauses: string[] = [];

  for (const [key, values] of params) {
    if (key === 'lang' || key === excludeKey || values.length === 0) continue;

    if (filterMap.has(key)) {
      const prop = filterMap.get(key)!;
      const parts: string[] = [];
      for (const v of values) {
        if (v.startsWith('http') && !v.includes('>')) {
          parts.push(`?s ${prop} <${v}> .`);
        } else {
          parts.push(`?s ${prop} ?${key}Val . FILTER(str(?${key}Val) = "${escapeLiteral(v)}")`);
        }
      }
      if (parts.length) whereClauses.push(unionOrSingle(parts));
    } else if (dateFilters.has(key)) {
      const prop = dateFilters.get(key)!;
      const safeV = escapeLiteral(values[0]);
      whereClauses.push(
        `OPTIONAL { ?s ${prop} ?${key}Val . } ` +
          `FILTER(!BOUND(?${key}Val) || ?${key}Val >= "${safeV}"^^xsd:date)`,
      );
    } else if (key === 'entityType') {
      const iriList = values
        .filter((v) => v.startsWith('http') && !v.includes('>'))
        .map((v) => `<${v}>`)
        .join(', ');
      if (iriList) {
        whereClauses.push(`FILTER(?type IN (${iriList}) || ?type = compass:CountryArea)`);
      }
    } else if (rangeFilters.has(key)) {
      const [prop, datatype] = rangeFilters.get(key)!;
      const numericVal = Number(values[0]);
      if (Number.isNaN(numericVal)) continue;
      if (datatype && datatype.includes('gYear')) {
        const yearInt = Math.trunc(numericVal);
        whereClauses.push(
          `OPTIONAL { ?s ${prop} ?${key}Val . } ` +
            `FILTER(!BOUND(?${key}Val) || ?${key}Val >= "${yearInt}"^^xsd:gYear)`,
        );
      } else {
        whereClauses.push(
          `OPTIONAL { ?s ${prop} ?${key}Val . } ` +
            `FILTER(!BOUND(?${key}Val) || ?${key}Val >= ${numericVal})`,
        );
      }
    }
  }

  return whereClauses;
}

function categorizeSpecs(specs: Spec[]) {
  const filterMap = new Map<string, string>();
  const rangeFilters = new Map<string, [string, string | null]>();
  const dateFilters = new Map<string, string>();
  for (const spec of specs) {
    const prefixed = toPrefixed(spec.path_iri);
    if (spec.filter_type === 'multiselect' || spec.filter_type === 'toggle') {
      filterMap.set(spec.id, prefixed);
    } else if (spec.filter_type === 'slider') {
      rangeFilters.set(spec.id, [prefixed, spec.datatype]);
    } else if (spec.filter_type === 'datepicker') {
      dateFilters.set(spec.id, prefixed);
    }
  }
  return { filterMap, rangeFilters, dateFilters };
}

/** Count-per-value query for one tag dimension (drill-down faceting). */
export function buildFacetQuery(specs: Spec[], lang: string, params: ParamMap, targetId: string): string {
  const { filterMap, rangeFilters, dateFilters } = categorizeSpecs(specs);
  const targetPath = filterMap.get(targetId)!;

  const preamble = sparqlPreamble(lang);
  const whereClauses = buildWhereClauses(params, filterMap, rangeFilters, dateFilters, targetId);

  let sparqlWhere = preamble + `        ?s ${targetPath} ?val .\n`;
  sparqlWhere += '        FILTER(?type != compass:CountryArea)\n';
  if (whereClauses.length) {
    sparqlWhere += '        ' + whereClauses.join('\n        ') + '\n';
  }

  return (
    SPARQL_PREFIXES +
    '    SELECT ?val (COUNT(DISTINCT ?s) AS ?n)\n' +
    '    WHERE {\n' +
    sparqlWhere +
    '    }\n' +
    '    GROUP BY ?val\n'
  );
}

/** The full SPARQL SELECT query for the entities endpoint. */
export function buildEntitiesQuery(specs: Spec[], lang: string, params: ParamMap): string {
  const { filterMap, rangeFilters, dateFilters } = categorizeSpecs(specs);

  const preamble = sparqlPreamble(lang);
  const autoOptionals = specs.map((spec) => buildOptional(spec, lang)).join('\n        ');
  const autoSelects = specs.map((spec) => buildSelectExpr(spec)).join('\n           ');
  const whereClauses = buildWhereClauses(params, filterMap, rangeFilters, dateFilters);

  let sparqlWhere = preamble + '        ' + autoOptionals + '\n' + specialOptionals();
  if (whereClauses.length) {
    sparqlWhere += '        ' + whereClauses.join('\n        ') + '\n';
  }

  return (
    SPARQL_PREFIXES +
    '    SELECT ?s ?label ?lat ?long ?type\n' +
    '           (SAMPLE(?typeLabel) AS ?typeLabelResult)\n' +
    '           ' +
    autoSelects +
    '\n' +
    specialSelects() +
    '    WHERE {\n' +
    sparqlWhere +
    '    }\n' +
    '    GROUP BY ?s ?label ?lat ?long ?type\n'
  );
}
