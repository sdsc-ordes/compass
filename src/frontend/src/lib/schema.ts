import { getFilterWidgets } from '../engine';
import type { FilterOption } from '../engine/namespaces';
import type { IconName } from './icons';

export const DIM_IDS: string[] = [
  'entityType',
  'species',
  'topic',
  'workArea',
  'conservation',
  'pollution',
  'countryArea',
  'relatedProgramme',
];

export const TYPE_DIM = 'entityType';

export const SECTION_IDS: string[] = DIM_IDS.filter((id) => id !== TYPE_DIM);

export type Option = FilterOption;

export const DIM_ICONS: Partial<Record<string, IconName>> = {
  species: 'whale',
  topic: 'tag',
  workArea: 'briefcase',
  conservation: 'shield',
  pollution: 'droplet',
  countryArea: 'globe',
  relatedProgramme: 'folder',
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
