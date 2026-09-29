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

const ENTITIES = '/api/v1/entities';
const FACETS = '/api/v1/entities/facets';

const urlOf = (path: string, params?: URLSearchParams): string =>
  `${apiBase}${path}${params ? `?${params}` : ''}`;

async function fetchJson<T>(path: string, params?: URLSearchParams): Promise<T> {
  const response = await fetch(urlOf(path, params));
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

// Requests sent ahead of the call that wants them; that call takes one over once.
const warm = new Map<string, Promise<unknown>>();

function getJson<T>(path: string, params?: URLSearchParams): Promise<T> {
  const key = urlOf(path, params);
  const held = warm.get(key) as Promise<T> | undefined;
  warm.delete(key);
  return held ?? fetchJson<T>(path, params);
}

// The first load's queries, sent alongside the schema rather than after it.
export function prefetch(lang: string, filters: Filters): void {
  const params = toParams(lang, filters);
  for (const path of [ENTITIES, FACETS]) {
    const req = fetchJson(path, params);
    req.catch(() => {}); // the taker reports a failure
    warm.set(urlOf(path, params), req);
  }
}

export async function init(url: string): Promise<void> {
  // Before the first await: prefetch() reads it straight after the call.
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
