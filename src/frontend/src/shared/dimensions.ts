/**
 * Tag dimensions, taken from the filter schema the API derives from the SHACL
 * shapes. Only multiselect widgets qualify; sliders, toggles and the synthetic
 * entity-type filter do not.
 */
import { getFiltersSchema } from '../engine';
import type { FilterOption, FilterSchemaEntry } from '../engine/namespaces';

export type Dimension = { id: string; label: string };

/** A multiselect entry, narrowed so its options are known to be present. */
export type MultiselectFilter = FilterSchemaEntry & { options: FilterOption[] };

/** Every dimension the UI renders as chips, in the schema's own order. */
export function multiselectFilters(lang: string): MultiselectFilter[] {
  return getFiltersSchema(lang).filter(
    (f): f is MultiselectFilter => f.type === 'multiselect' && Array.isArray(f.options),
  );
}

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

export const ENTITY_TYPE_DIMENSION = 'entityType';

const EXCLUDED = new Set([ENTITY_TYPE_DIMENSION]);

// Preferred reading order; anything unlisted falls to the end.
const ORDER = [
  'workArea',
  'conservation',
  'topic',
  'pollution',
  'species',
  'countryArea',
  'forum',
  'relatedProject',
];

const rank = (id: string) => {
  const index = ORDER.indexOf(id);
  return index === -1 ? ORDER.length : index;
};

export function loadDimensions(lang: string): Dimension[] {
  return multiselectFilters(lang)
    .filter((f) => !EXCLUDED.has(f.id))
    .map((f) => ({ id: f.id, label: f.label }))
    .sort((a, b) => rank(a.id) - rank(b.id));
}

/**
 * The entity classes and their labels in *lang*, for the map legend.
 *
 * These come from the same schema the filters do rather than a table in the
 * widget: the labels live in the ontology, already translated, and a class
 * added there reaches the legend without a frontend change.
 */
export function entityTypes(lang: string): FilterOption[] {
  return multiselectFilters(lang).find((f) => f.id === ENTITY_TYPE_DIMENSION)?.options ?? [];
}

/** Every query parameter the widget owns, so it can rewrite only its own. */
export function ownedUrlParams(lang: string): string[] {
  return [...getFiltersSchema(lang).map((f) => f.id), 'lang'];
}
