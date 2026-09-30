import { getFilterWidgets, type FilterOption } from '../engine';
import type { IconName } from './icons';

// Sidebar section order, following the taxonomy in source-data.ods.
export const DIM_IDS: string[] = [
  'entityType',
  'workArea',
  'topic',
  'programme',
  'species',
  'countryArea',
];

export const TYPE_DIM = 'entityType';

export const SECTION_IDS: string[] = DIM_IDS.filter((id) => id !== TYPE_DIM);

export type Option = FilterOption;

const DIM_ICONS: Partial<Record<string, IconName>> = {
  workArea: 'briefcase',
  topic: 'tag',
  programme: 'folder',
  species: 'whale',
  countryArea: 'globe',
};

export interface Dim {
  id: string;
  label: string;
  description?: string;
  options: Option[];
  icon?: IconName;
}

/** Build the sidebar dimensions from the loaded filter schema, in DIM_IDS order. */
export function buildDims(lang: string): Dim[] {
  const widgets = getFilterWidgets(lang);
  return DIM_IDS.map((id) => {
    const widget = widgets.find((w) => w.id === id);
    return {
      id,
      label: widget?.label ?? id,
      description: widget?.description,
      options: widget?.options ?? [],
      icon: DIM_ICONS[id],
    };
  });
}
