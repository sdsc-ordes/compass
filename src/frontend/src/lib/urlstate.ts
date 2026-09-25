import type { Lang } from './i18n';

export type QueryFilters = Record<string, string[]>;

type Dim = { id: string; options: readonly { value: string }[] };

const localName = (iri: string): string =>
  iri.slice(Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1);

// IRI -> URL token: the local name, or the full IRI if another IRI shares that name.
function tokens(iris: readonly string[]): Map<string, string> {
  const names = iris.map(localName);
  const unique = (n: string) => names.indexOf(n) === names.lastIndexOf(n);
  return new Map(iris.map((iri, i) => [iri, unique(names[i]) ? names[i] : iri]));
}

// URL token (or full IRI) -> IRI.
const reverse = (iris: readonly string[]): Map<string, string> =>
  new Map(
    [...tokens(iris)].flatMap(([iri, tok]) => [
      [tok, iri],
      [iri, iri],
    ]),
  );

const values = (dim: Dim) => dim.options.map((o) => o.value);

export function encodeFilters(filters: QueryFilters, dims: readonly Dim[]): QueryFilters {
  const out: QueryFilters = {};
  for (const d of dims) {
    const t = tokens(values(d));
    if (filters[d.id]?.length) out[d.id] = filters[d.id].map((v) => t.get(v) ?? v);
  }
  return out;
}

// Accepts local names and full IRIs; drops anything the dimension does not know.
export function decodeFilters(params: URLSearchParams, dims: readonly Dim[]): QueryFilters {
  const out: QueryFilters = {};
  for (const d of dims) {
    const back = reverse(values(d));
    const iris = params.getAll(d.id).flatMap((v) => back.get(v) ?? []);
    if (iris.length) out[d.id] = iris;
  }
  return out;
}

export const encodePin = (id: string, ids: readonly string[]): string =>
  tokens(ids).get(id) ?? id;

export const decodePin = (token: string, ids: readonly string[]): string | null =>
  reverse(ids).get(token) ?? null;

// An open pin replaces the filters: `pin` is an already-encoded token.
export function syncUrl(
  filters: QueryFilters,
  lang: string,
  dims: readonly Dim[],
  pin: string | null = null,
): void {
  const url = new URL(window.location.href);
  const ours = new Set<string>([...dims.map((d) => d.id), 'lang', 'state', 'pin']);
  [...url.searchParams.keys()].forEach((k) => {
    if (ours.has(k)) url.searchParams.delete(k);
  });
  if (pin) url.searchParams.set('pin', pin);
  else
    for (const [key, vs] of Object.entries(encodeFilters(filters, dims))) {
      vs.forEach((v) => url.searchParams.append(key, v));
    }
  url.searchParams.set('lang', lang);
  window.history.replaceState({}, '', url.toString());
}

export function langFromQuery(params: URLSearchParams): Lang | null {
  const value = params.get('lang');
  return value === 'en' || value === 'de' ? value : null;
}
