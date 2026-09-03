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

const PIN_CLASSES = ['InternationalForum', 'Network', 'Project', 'PartnerOrganization'] as const;

/**
 * Which variable a set of filter clauses constrains.
 *
 * Filters read the same for a pin the map draws and for the pin that puts a
 * region on the map, but they cannot share variable names: the region branch
 * nests its copy inside FILTER EXISTS, where the outer ?type is already bound
 * to compass:CountryArea.
 */
type Subject = {
  var: string;
  typeVar: string;
  /** Keeps helper variables distinct across the two copies. */
  suffix: string;
  /** Bind typeVar here, rather than relying on an outer BIND. */
  declareType: boolean;
};

const PIN: Subject = { var: '?s', typeVar: '?type', suffix: '', declareType: false };
const REGION_PIN: Subject = { var: '?pin', typeVar: '?pinType', suffix: 'Pin', declareType: true };

/** The four entity classes that carry coordinates -- the pins on the map. */
function pinBranch(whereClauses: string[], indent = '        '): string {
  const branches = PIN_CLASSES.map(
    (name) => `{ ?s a compass:${name} . BIND(compass:${name} AS ?type) }`,
  ).join(`\n${indent}UNION `);
  let body = `${indent}${branches}\n`;
  if (whereClauses.length) body += indent + whereClauses.join(`\n${indent}`) + '\n';
  return body;
}

/**
 * Country/Area concepts, reachable only through a pin that points at one.
 *
 * A region is a shaded polygon rather than a result, and it carries no tags of
 * its own: it reaches the map because some pin passing the same filters records
 * it, so shading always means "matching pins are in here".
 */
function regionBranch(whereClauses: string[], indent = '        '): string {
  let inner = `${indent}    ?pin compass:countryArea ?s .\n`;
  if (whereClauses.length) {
    inner += `${indent}    ` + whereClauses.join(`\n${indent}    `) + '\n';
  }
  return (
    `${indent}?s a compass:CountryArea .\n` +
    `${indent}BIND(compass:CountryArea AS ?type)\n` +
    `${indent}FILTER EXISTS {\n${inner}${indent}}\n`
  );
}

/**
 * Geometry and label binding, applied to pins and regions alike.
 *
 * Regions have no coordinates and label themselves with skos:prefLabel, so
 * geometry is OPTIONAL and the label is COALESCEd across both properties.
 */
function sharedOptionals(lang: string): string {
  return `        OPTIONAL { ?s geo:lat ?lat . }
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
        OPTIONAL { ?s compass:wpEntityTagId ?wpEntityTagId . }
`;
}

function specialSelects(): string {
  return (
    '           (SAMPLE(?selfStart) AS ?selfStart)\n' +
    '           (SAMPLE(?selfEnd) AS ?selfEnd)\n' +
    '           (SAMPLE(?wpEntityTagId) AS ?wpEntityTagId)\n'
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
  subject: Subject = PIN,
  excludeKey: string | null = null,
): string[] {
  const whereClauses: string[] = [];
  const subj = subject.var;

  for (const [key, values] of params) {
    if (key === 'lang' || key === excludeKey || values.length === 0) continue;
    const v0 = `?${key}${subject.suffix}Val`;

    if (filterMap.has(key)) {
      const prop = filterMap.get(key)!;
      const parts: string[] = [];
      for (const v of values) {
        if (v.startsWith('http') && !v.includes('>')) {
          parts.push(`${subj} ${prop} <${v}> .`);
        } else {
          parts.push(`${subj} ${prop} ${v0} . FILTER(str(${v0}) = "${escapeLiteral(v)}")`);
        }
      }
      if (parts.length) whereClauses.push(unionOrSingle(parts));
    } else if (dateFilters.has(key)) {
      const prop = dateFilters.get(key)!;
      const safeV = escapeLiteral(values[0]);
      whereClauses.push(
        `OPTIONAL { ${subj} ${prop} ${v0} . } ` +
          `FILTER(!BOUND(${v0}) || ${v0} >= "${safeV}"^^xsd:date)`,
      );
    } else if (key === 'entityType') {
      const iriList = values
        .filter((v) => v.startsWith('http') && !v.includes('>'))
        .map((v) => `<${v}>`)
        .join(', ');
      if (iriList) {
        // A region has no type of its own to filter, so the legend reaches it
        // through the pins: hide every Project and a region holding only
        // projects stops being shaded.
        const filter = `FILTER(${subject.typeVar} IN (${iriList}))`;
        whereClauses.push(
          subject.declareType ? `${subj} a ${subject.typeVar} . ${filter}` : filter,
        );
      }
    } else if (rangeFilters.has(key)) {
      const [prop, datatype] = rangeFilters.get(key)!;
      const numericVal = Number(values[0]);
      if (Number.isNaN(numericVal)) continue;
      if (datatype && datatype.includes('gYear')) {
        const yearInt = Math.trunc(numericVal);
        whereClauses.push(
          `OPTIONAL { ${subj} ${prop} ${v0} . } ` +
            `FILTER(!BOUND(${v0}) || ${v0} >= "${yearInt}"^^xsd:gYear)`,
        );
      } else {
        whereClauses.push(
          `OPTIONAL { ${subj} ${prop} ${v0} . } ` +
            `FILTER(!BOUND(${v0}) || ${v0} >= ${numericVal})`,
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

/**
 * Count-per-value query for one tag dimension (drill-down faceting).
 *
 * Regions are background context rather than results (see the map's result
 * badge, which counts point features only), so only the pin branch is counted.
 */
export function buildFacetQuery(specs: Spec[], lang: string, params: ParamMap, targetId: string): string {
  const { filterMap, rangeFilters, dateFilters } = categorizeSpecs(specs);
  const targetPath = filterMap.get(targetId)!;

  const whereClauses = buildWhereClauses(params, filterMap, rangeFilters, dateFilters, PIN, targetId);

  let sparqlWhere = pinBranch(whereClauses);
  sparqlWhere += `        ?s ${targetPath} ?val .\n`;
  sparqlWhere += sharedOptionals(lang);

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

  const autoOptionals = specs.map((spec) => buildOptional(spec, lang)).join('\n        ');
  const autoSelects = specs.map((spec) => buildSelectExpr(spec)).join('\n           ');
  const pinClauses = buildWhereClauses(params, filterMap, rangeFilters, dateFilters, PIN);
  const regionClauses = buildWhereClauses(params, filterMap, rangeFilters, dateFilters, REGION_PIN);

  let sparqlWhere =
    '        {\n' +
    pinBranch(pinClauses, '            ') +
    '        } UNION {\n' +
    regionBranch(regionClauses, '            ') +
    '        }\n';
  sparqlWhere += sharedOptionals(lang);
  sparqlWhere += '        ' + autoOptionals + '\n' + specialOptionals();

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
