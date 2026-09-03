/**
 * Everything the UI needs from the ontology, fetched from the API.
 *
 * The API owns the data, so an editorial update reaches the widget on the next
 * request -- no rebuild, and no second copy of the query layer to keep in step
 * with the backend's.
 */
import type { Filters } from './namespaces';

export type Feature = {
  type: 'Feature';
  geometry: { type: string; coordinates: any } | null;
  properties: Record<string, any>;
};
export type FeatureCollection = { type: 'FeatureCollection'; features: Feature[] };

/** Filter schema per language, fetched once by init(). */
const schemaByLang: Record<string, any[]> = {};
let apiBase = '';

/** Turn the UI's filter object into query parameters, one entry per value. */
function toParams(lang: string, filters: Filters): URLSearchParams {
  const params = new URLSearchParams({ lang });
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value === undefined || value === null) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined && item !== null && item !== '') {
        params.append(key, String(item));
      }
    }
  }
  return params;
}

async function getJson(path: string, params?: URLSearchParams): Promise<any> {
  const query = params ? `?${params}` : '';
  const response = await fetch(`${apiBase}${path}${query}`);
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Point the engine at an API and load the filter schema for both languages.
 *
 * The schema is prefetched rather than requested per render so that
 * getFiltersSchema stays synchronous for the components that read it during
 * reactive updates. It lists every tag value, so it has to come from the API:
 * adding a concept changes it.
 */
export async function init(url: string): Promise<void> {
  apiBase = (url ?? '').replace(/\/$/, '');
  const [en, de] = await Promise.all([
    getJson('/api/filters/schema', new URLSearchParams({ lang: 'en' })),
    getJson('/api/filters/schema', new URLSearchParams({ lang: 'de' })),
  ]);
  schemaByLang.en = en;
  schemaByLang.de = de;
}

export async function getEntities(lang: string, filters: Filters): Promise<FeatureCollection> {
  return getJson('/api/entities/', toParams(lang, filters));
}

/** Drill-down counts per tag: { dimensionId: { tagIri: count } }. */
export async function getFacets(
  lang: string,
  filters: Filters,
): Promise<Record<string, Record<string, number>>> {
  return getJson('/api/entities/facets', toParams(lang, filters));
}

/** Filter UI schema for a language, from init()'s prefetch (English fallback). */
export function getFiltersSchema(lang: string): any[] {
  return schemaByLang[lang] ?? schemaByLang.en ?? [];
}
