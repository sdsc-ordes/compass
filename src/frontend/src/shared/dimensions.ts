/**
 * The tag dimensions an entity can be described by.
 *
 * These come from `/api/filters/schema`, which the backend derives from the
 * SHACL property shapes — so adding a property shape gives both a filter and a
 * sidebar row, with no list to keep in step by hand. Only multiselect widgets
 * are tag dimensions; sliders, toggles and the synthetic entity-type filter are
 * not. Display-only properties (description, altLabel, relatedOrganization) are
 * absent from the schema by design and so never appear as chips.
 */
export type Dimension = { id: string; label: string };

const EXCLUDED = new Set(['entityType']);

// Preferred reading order; anything unlisted falls to the end.
const ORDER = [
  'workArea', 'conservation', 'topic', 'pollution',
  'species', 'countryArea', 'forum', 'relatedProject',
];

const rank = (id: string) => {
  const index = ORDER.indexOf(id);
  return index === -1 ? ORDER.length : index;
};

// One request per (backend, language); the sidebar mounts and unmounts often.
const cache = new Map<string, Promise<Dimension[]>>();

export function loadDimensions(apiurl: string, lang: string): Promise<Dimension[]> {
  if (!apiurl) return Promise.resolve([]);
  const key = `${apiurl}|${lang}`;
  if (!cache.has(key)) {
    const request = fetch(`${apiurl}/api/filters/schema?lang=${lang}`)
      .then((resp) => (resp.ok ? resp.json() : []))
      .then((schema: any[]) =>
        schema
          .filter((f) => f.type === 'multiselect' && !EXCLUDED.has(f.id))
          .map((f) => ({ id: f.id, label: f.label }))
          .sort((a, b) => rank(a.id) - rank(b.id)),
      )
      .catch((e) => {
        console.error('[Compass] Failed to load tag dimensions:', e);
        cache.delete(key); // let a later mount retry
        return [] as Dimension[];
      });
    cache.set(key, request);
  }
  return cache.get(key)!;
}
