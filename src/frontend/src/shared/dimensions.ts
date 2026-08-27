/**
 * Tag dimensions, taken from the filter schema the backend derives from the
 * SHACL shapes. Only multiselect widgets qualify; sliders, toggles and the
 * synthetic entity-type filter do not.
 */
export type Dimension = { id: string; label: string };

// Chip colour per dimension; shared by the sidebar and the list view.
const CHIP_CLASS: Record<string, string> = {
  workArea: 'chip-tag',
  conservation: 'chip-tag',
  topic: 'chip-focus',
  pollution: 'chip-species',
  species: 'chip-species',
  countryArea: 'chip-region',
  forum: 'chip-focus',
  relatedProject: 'chip-focus',
};

export const chipClass = (id: string) => CHIP_CLASS[id] ?? 'chip-tag';

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

// The sidebar mounts and unmounts often; fetch once per backend and language.
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
