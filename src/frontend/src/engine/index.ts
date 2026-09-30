export type Filters = Record<string, string[]>;

export type FilterOption = { value: string; label: string; description?: string };

type FilterWidget = {
  id: string;
  path: string;
  label: string;
  description?: string;
  type: 'multiselect' | 'slider' | 'datepicker' | 'toggle';
  order: number;
  options?: FilterOption[];
  min?: number | string;
  max?: number | string;
};

type EntityProperties = {
  id: string;
  label: string;
  type: string;
  typeIri: string;
  storiesUrl: string;
} & Record<string, unknown>;

type Geometry = { type: string; coordinates: number[] | number[][][] };

export type Feature = {
  type: 'Feature';
  geometry: Geometry | null;
  properties: EntityProperties;
};

type FeatureCollection = { type: 'FeatureCollection'; features: Feature[] };

type FacetCounts = Record<string, Record<string, number>>;

const ENTITIES = '/api/v1/entities';
const FACETS = '/api/v1/entities/facets';

const widgetsByLang: Record<string, FilterWidget[]> = {};
let apiBase = '';

function toParams(lang: string, filters: Filters): URLSearchParams {
  const params = new URLSearchParams({ lang });
  for (const [key, values] of Object.entries(filters)) {
    for (const value of values) params.append(key, value);
  }
  return params;
}

const urlOf = (path: string, params?: URLSearchParams): string =>
  `${apiBase}${path}${params ? `?${params}` : ''}`;

async function fetchJson<T>(path: string, params?: URLSearchParams): Promise<T> {
  const response = await fetch(urlOf(path, params));
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// Prefetched requests by URL; the first getJson for that URL takes it over.
const prefetched = new Map<string, Promise<unknown>>();

function getJson<T>(path: string, params?: URLSearchParams): Promise<T> {
  const key = urlOf(path, params);
  const held = prefetched.get(key) as Promise<T> | undefined;
  prefetched.delete(key);
  return held ?? fetchJson<T>(path, params);
}

/** Send the first load's queries without waiting for the filter schema. */
export function prefetch(lang: string, filters: Filters): void {
  const params = toParams(lang, filters);
  for (const path of [ENTITIES, FACETS]) {
    const request = fetchJson(path, params);
    request.catch(() => {}); // reported by the getJson caller that takes it
    prefetched.set(urlOf(path, params), request);
  }
}

/** Point the client at `url` and load the filter schema in both languages. */
export async function init(url: string): Promise<void> {
  // Set before the first await: the caller runs prefetch() as soon as this returns.
  apiBase = (url ?? '').replace(/\/$/, '');
  const [en, de] = await Promise.all([
    getJson<FilterWidget[]>('/api/v1/filters', new URLSearchParams({ lang: 'en' })),
    getJson<FilterWidget[]>('/api/v1/filters', new URLSearchParams({ lang: 'de' })),
  ]);
  widgetsByLang.en = en;
  widgetsByLang.de = de;
}

export async function getEntities(lang: string, filters: Filters): Promise<FeatureCollection> {
  return getJson<FeatureCollection>(ENTITIES, toParams(lang, filters));
}

export async function getFacets(lang: string, filters: Filters): Promise<FacetCounts> {
  return getJson<FacetCounts>(FACETS, toParams(lang, filters));
}

export function getFilterWidgets(lang: string): FilterWidget[] {
  return widgetsByLang[lang] ?? widgetsByLang.en ?? [];
}
