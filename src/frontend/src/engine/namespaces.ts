export const COMPASS_NS = 'http://example.org/ocean-org/ontology#';
export const DATA_NS = 'http://example.org/ocean-org/data#';

export const ENTITY_CLASS = {
  PartnerOrganization: `${COMPASS_NS}PartnerOrganization`,
  Network: `${COMPASS_NS}Network`,
  InternationalForum: `${COMPASS_NS}InternationalForum`,
  Programme: `${COMPASS_NS}Programme`,
  HostOrganization: `${COMPASS_NS}HostOrganization`,
} as const;

// The map's subject rather than one of its results: the API draws it whatever
// the filters say, it has no entityType option, and it is left out of the tally.
export const ALWAYS_ON_CLASSES: readonly string[] = [ENTITY_CLASS.HostOrganization];

export const FEATURED_IRI = `${DATA_NS}OceanCare`;

export type Filters = Record<string, string | string[] | undefined>;

export type FilterOption = { value: string; label: string; description?: string };

export type FilterWidget = {
  id: string;
  path: string;
  label: string;
  description?: string;
  type: 'multiselect' | 'slider' | 'datepicker' | 'toggle';
  order: number;
  options?: FilterOption[];
  min?: number | string;
  max?: number | string;
};
