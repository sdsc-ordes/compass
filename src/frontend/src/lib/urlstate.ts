import type { Lang } from './i18n';

export type QueryFilters = Record<string, string[]>;

export function syncUrl(filters: QueryFilters, lang: string, dimIds: readonly string[]): void {
  const url = new URL(window.location.href);
  const ours = new Set<string>([...dimIds, 'lang', 'state']);
  [...url.searchParams.keys()].forEach((k) => {
    if (ours.has(k)) url.searchParams.delete(k);
  });
  for (const [key, values] of Object.entries(filters)) {
    values.forEach((v) => url.searchParams.append(key, String(v)));
  }
  url.searchParams.set('lang', lang);
  window.history.replaceState({}, '', url.toString());
}

export function langFromQuery(params: URLSearchParams): Lang | null {
  const value = params.get('lang');
  return value === 'en' || value === 'de' ? value : null;
}

export function filtersFromQuery(params: URLSearchParams): QueryFilters {
  const filters: QueryFilters = {};
  for (const [key, value] of params.entries()) {
    if (key === 'lang' || key === 'state') continue;
    (filters[key] ||= []).push(value);
  }
  return filters;
}

export function pickDimensions(
  raw: Record<string, unknown>,
  dimIds: readonly string[],
): QueryFilters {
  const picked: QueryFilters = {};
  for (const id of dimIds) {
    const value = raw[id];
    if (Array.isArray(value)) picked[id] = value.map(String);
    else if (typeof value === 'string' && value) picked[id] = [value];
  }
  return picked;
}

export interface SharedState {
  filters?: Record<string, unknown>;
  lang?: string;
  view?: unknown;
}

export async function fetchSharedState(
  apiurl: string,
  id: string,
): Promise<SharedState | null> {
  if (!apiurl || !id) return null;
  try {
    const resp = await fetch(`${apiurl}/api/states/${id}`);
    if (!resp.ok) return null;
    return (await resp.json()) as SharedState;
  } catch (e) {
    console.error('[Compass] Failed to restore state:', e);
    return null;
  }
}
