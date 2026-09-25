import type { Lang } from './i18n';

export type QueryFilters = Record<string, string[]>;

type Dim = { id: string; options: readonly { value: string }[] };

const localName = (iri: string): string =>
  iri.slice(Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/')) + 1);

// IRI -> URL token: the local name, or the full IRI if the dimension shares that name.
function tokens(dim: Dim): Map<string, string> {
  const names = dim.options.map((o) => localName(o.value));
  const unique = (n: string) => names.indexOf(n) === names.lastIndexOf(n);
  return new Map(dim.options.map((o, i) => [o.value, unique(names[i]) ? names[i] : o.value]));
}

export function encodeFilters(filters: QueryFilters, dims: readonly Dim[]): QueryFilters {
  const out: QueryFilters = {};
  for (const d of dims) {
    const t = tokens(d);
    if (filters[d.id]?.length) out[d.id] = filters[d.id].map((v) => t.get(v) ?? v);
  }
  return out;
}

// Accepts local names and full IRIs; drops anything the dimension does not know.
export function decodeFilters(params: URLSearchParams, dims: readonly Dim[]): QueryFilters {
  const out: QueryFilters = {};
  for (const d of dims) {
    const back = new Map(
      [...tokens(d)].flatMap(([iri, tok]) => [
        [tok, iri],
        [iri, iri],
      ]),
    );
    const iris = params.getAll(d.id).flatMap((v) => back.get(v) ?? []);
    if (iris.length) out[d.id] = iris;
  }
  return out;
}

export function syncUrl(filters: QueryFilters, lang: string, dims: readonly Dim[]): void {
  const url = new URL(window.location.href);
  const ours = new Set<string>([...dims.map((d) => d.id), 'lang', 'state']);
  [...url.searchParams.keys()].forEach((k) => {
    if (ours.has(k)) url.searchParams.delete(k);
  });
  for (const [key, values] of Object.entries(encodeFilters(filters, dims))) {
    values.forEach((v) => url.searchParams.append(key, v));
  }
  url.searchParams.set('lang', lang);
  window.history.replaceState({}, '', url.toString());
}

export function langFromQuery(params: URLSearchParams): Lang | null {
  const value = params.get('lang');
  return value === 'en' || value === 'de' ? value : null;
}
