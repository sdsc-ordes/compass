import type { Filters, FilterWidget } from './namespaces';

export type EntityProperties = {
  id: string;
  label: string;
  type: string;
  typeIri: string;
  storiesUrl: string;
} & Record<string, unknown>;

export type Geometry = { type: string; coordinates: number[] | number[][][] };

export type Feature = {
  type: 'Feature';
  geometry: Geometry | null;
  properties: EntityProperties;
};

export type FeatureCollection = { type: 'FeatureCollection'; features: Feature[] };

export type FacetCounts = Record<string, Record<string, number>>;

const widgetsByLang: Record<string, FilterWidget[]> = {};
let apiBase = '';

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

export async function init(url: string): Promise<void> {
  apiBase = (url ?? '').replace(/\/$/, '');
  const [en, de] = await Promise.all([
    getJson<FilterWidget[]>('/api/v1/filters', new URLSearchParams({ lang: 'en' })),
    getJson<FilterWidget[]>('/api/v1/filters', new URLSearchParams({ lang: 'de' })),
  ]);
  widgetsByLang.en = en;
  widgetsByLang.de = de;
}

export async function getEntities(lang: string, filters: Filters): Promise<FeatureCollection> {
  return getJson<FeatureCollection>('/api/v1/entities', toParams(lang, filters));
}

export async function getFacets(lang: string, filters: Filters): Promise<FacetCounts> {
  return getJson<FacetCounts>('/api/v1/entities/facets', toParams(lang, filters));
}

export function getFilterWidgets(lang: string): FilterWidget[] {
  return widgetsByLang[lang] ?? widgetsByLang.en ?? [];
}
