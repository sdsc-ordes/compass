/** Everything the UI needs from the ontology: entities, facet counts, filters. */
import { initStore, query } from './oxigraph';
import { buildEntitiesQuery, buildFacetQuery, toParamMap } from './sparqlBuilder';
import { resultsToGeojson, type FeatureCollection } from './resultParser';
import type { Spec, Filters } from './namespaces';

import specsJson from '../generated/specs.json';
import filtersEn from '../generated/filters.en.json';
import filtersDe from '../generated/filters.de.json';

const specs = specsJson as unknown as Spec[];
const filtersByLang: Record<string, any[]> = {
  en: filtersEn as unknown as any[],
  de: filtersDe as unknown as any[],
};

// entityType is the map legend; relatedProject and forum are relations, not tags.
const FACET_EXCLUDED = new Set(['entityType', 'relatedProject', 'forum']);

let ready = false;

/** Load the RDF into oxigraph. Idempotent; safe to await repeatedly. */
export async function init(): Promise<void> {
  if (ready) return;
  await initStore();
  ready = true;
}

export async function getEntities(lang: string, filters: Filters): Promise<FeatureCollection> {
  await init();
  const sparql = buildEntitiesQuery(specs, lang, toParamMap(filters));
  return resultsToGeojson(query(sparql), specs);
}

/** Drill-down counts per tag: { dimensionId: { tagIri: count } }. */
export async function getFacets(lang: string, filters: Filters): Promise<Record<string, Record<string, number>>> {
  await init();
  const params = toParamMap(filters);
  const facets: Record<string, Record<string, number>> = {};
  for (const spec of specs) {
    if (spec.filter_type !== 'multiselect' || spec.category !== 'iri_with_label' || FACET_EXCLUDED.has(spec.id)) {
      continue;
    }
    const rows = query(buildFacetQuery(specs, lang, params, spec.id));
    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (row['val'] && row['n']) counts[row['val']] = parseInt(row['n'], 10);
    }
    facets[spec.id] = counts;
  }
  return facets;
}

/** Precomputed filter UI schema for a language (falls back to English). */
export function getFiltersSchema(lang: string): any[] {
  return filtersByLang[lang] ?? filtersByLang.en;
}
