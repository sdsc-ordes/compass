/**
 * Everything the UI needs from the ontology, fetched from the API.
 *
 * The API owns the data and the query layer, so an editorial update reaches
 * the widget on the next request without anything being rebuilt.
 */
import type { Filters, FilterSchemaEntry } from './namespaces';

/** The properties the API puts on every feature, whatever the shapes add. */
export type EntityProperties = {
  id: string;
  label: string;
  type: string;
  typeIri: string;
  /** Filtered stories index for this entity, or '' when it has no term id. */
  storiesUrl: string;
  /** Set on Country/Area features, which arrive without geometry. */
  is_region?: boolean;
  regionKey?: string;
} & Record<string, unknown>;

export type Geometry = { type: string; coordinates: number[] | number[][][] };

export type Feature = {
  type: 'Feature';
  geometry: Geometry | null;
  properties: EntityProperties;
};

export type FeatureCollection = { type: 'FeatureCollection'; features: Feature[] };

/** Drill-down counts per tag: { dimensionId: { tagIri: count } }. */
export type FacetCounts = Record<string, Record<string, number>>;

/** Filter schema per language, fetched once by init(). */
const schemaByLang: Record<string, FilterSchemaEntry[]> = {};
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

async function getJson<T>(path: string, params?: URLSearchParams): Promise<T> {
  const query = params ? `?${params}` : '';
  const response = await fetch(`${apiBase}${path}${query}`);
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
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
    getJson<FilterSchemaEntry[]>('/api/filters/schema', new URLSearchParams({ lang: 'en' })),
    getJson<FilterSchemaEntry[]>('/api/filters/schema', new URLSearchParams({ lang: 'de' })),
  ]);
  schemaByLang.en = en;
  schemaByLang.de = de;
}

export async function getEntities(lang: string, filters: Filters): Promise<FeatureCollection> {
  return getJson<FeatureCollection>('/api/entities/', toParams(lang, filters));
}

export async function getFacets(lang: string, filters: Filters): Promise<FacetCounts> {
  return getJson<FacetCounts>('/api/entities/facets', toParams(lang, filters));
}

/** Filter UI schema for a language, from init()'s prefetch (English fallback). */
export function getFiltersSchema(lang: string): FilterSchemaEntry[] {
  return schemaByLang[lang] ?? schemaByLang.en ?? [];
}
