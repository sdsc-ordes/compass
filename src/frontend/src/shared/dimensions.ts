/**
 * Tag dimensions, taken from the filter schema the export script derives from
 * the SHACL shapes. Only multiselect widgets qualify; sliders, toggles and the
 * synthetic entity-type filter do not.
 */
import { getFiltersSchema } from '../engine';

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

export function loadDimensions(lang: string): Dimension[] {
  return getFiltersSchema(lang)
    .filter((f: any) => f.type === 'multiselect' && !EXCLUDED.has(f.id))
    .map((f: any) => ({ id: f.id, label: f.label }))
    .sort((a, b) => rank(a.id) - rank(b.id));
}
