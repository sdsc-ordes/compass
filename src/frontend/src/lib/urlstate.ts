/**
 * The address bar, in both directions.
 *
 * The query string is the widget's only shareable state, so its shape is a
 * contract with every link already out there.
 */
import type { Lang } from './i18n';

/** Dimension id -> selected IRIs. The engine's Filters, narrowed to what we write. */
export type QueryFilters = Record<string, string[]>;

/**
 * Writes the filters to the address bar: one param per value, plus lang.
 *
 * Only our own parameters are rewritten. This used to build from origin +
 * pathname, which dropped everything the page arrived with — fine for a page
 * that is only the map, but embedded in a host page it wiped that page's own
 * query string on the visitor's first filter click.
 *
 * "Ours" is `dimIds` plus `lang` and `state`, and `state` goes on purpose: it
 * has already been applied by the time anything calls this, and leaving it in
 * would have a reload override the filters now in the bar. `dimIds` must be the
 * same list `pickDimensions` is given, so the write and the read back agree —
 * DIM_IDS is the authority for both.
 */
export function syncUrl(filters: QueryFilters, lang: string, dimIds: readonly string[]): void {
  const url = new URL(window.location.href);
  const ours = new Set<string>([...dimIds, 'lang', 'state']);
  /* A snapshot of the keys: delete() drops every value under a name at once. */
  [...url.searchParams.keys()].forEach((k) => {
    if (ours.has(k)) url.searchParams.delete(k);
  });
  for (const [key, values] of Object.entries(filters)) {
    values.forEach((v) => url.searchParams.append(key, String(v)));
  }
  url.searchParams.set('lang', lang);
  window.history.replaceState({}, '', url.toString());
}

/** The `lang` parameter, when it names a language the widget has. */
export function langFromQuery(params: URLSearchParams): Lang | null {
  const value = params.get('lang');
  return value === 'en' || value === 'de' ? value : null;
}

/** Every non-`lang` parameter, grouped by name — the loose inverse of syncUrl.
    Loose because a host page's own parameters land here too: `pickDimensions`
    below is where the list narrows to the dimensions the panel shows, and that
    is what keeps this in step with syncUrl's `dimIds`. */
export function filtersFromQuery(params: URLSearchParams): QueryFilters {
  const filters: QueryFilters = {};
  for (const [key, value] of params.entries()) {
    if (key === 'lang' || key === 'state') continue;
    (filters[key] ||= []).push(value);
  }
  return filters;
}

/** Narrows anything filter-shaped to the dimensions the panel shows. A bare
    string counts as one value. */
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

/** What `GET /api/states/{id}` answers with. Every field is optional to us. */
export interface SharedState {
  filters?: Record<string, unknown>;
  lang?: string;
  view?: unknown;
}

/** Restores a `?state=` link. Null when there is no backend to ask or the ask
    failed: an unrestorable link should leave the map usable, not broken. */
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
