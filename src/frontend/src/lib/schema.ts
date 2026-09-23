import { getFilterWidgets } from '../engine';
import type { FilterOption } from '../engine/namespaces';
import type { IconName } from './icons';

// Section order follows the editorial taxonomy in source-data.ods, so the
// sidebar reads the way the workbook does.
export const DIM_IDS: string[] = [
  'entityType',
  'workArea',
  'topic',
  'relatedProgramme',
  'species',
  'countryArea',
];

export const TYPE_DIM = 'entityType';

export const SECTION_IDS: string[] = DIM_IDS.filter((id) => id !== TYPE_DIM);

export type Option = FilterOption;

export const DIM_ICONS: Partial<Record<string, IconName>> = {
  workArea: 'briefcase',
  topic: 'tag',
  relatedProgramme: 'folder',
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

export function buildDims(lang: string): Dim[] {
  const widgets = getFilterWidgets(lang);
  return DIM_IDS.map((id) => {
    const dim = widgets.find((w) => w.id === id);
    return {
      id,
      label: dim?.label ?? id,
      ...(dim?.description ? { description: dim.description } : {}),
      options: dim?.options ?? [],
      icon: DIM_ICONS[id],
    };
  });
}
