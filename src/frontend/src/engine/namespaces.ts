/** Ontology identifiers the widget has to name, and the filter types built on them. */

export const COMPASS_NS = 'http://example.org/ocean-org/ontology#';
export const DATA_NS = 'http://example.org/ocean-org/data#';

/** The four entity classes that carry coordinates — the pins on the map. */
export const ENTITY_CLASS = {
  PartnerOrganization: `${COMPASS_NS}PartnerOrganization`,
  Network: `${COMPASS_NS}Network`,
  InternationalForum: `${COMPASS_NS}InternationalForum`,
  Project: `${COMPASS_NS}Project`,
} as const;

/** OceanCare itself, drawn as a star rather than a coloured dot. */
export const FEATURED_IRI = `${DATA_NS}OceanCare`;

/** A filter selection: one dimension id to the values chosen under it. */
export type Filters = Record<string, string | string[] | undefined>;

/**
 * One selectable value of a multiselect dimension, labelled in the active language.
 *
 * `description` is the concept's skos:definition, which the filter panel prints
 * under the option's name. The API omits the key entirely rather than sending an
 * empty string, so an undefined concept renders as a bare name.
 */
export type FilterOption = { value: string; label: string; description?: string };

/** One filter-panel dimension the API derives from the SHACL shapes. */
export type FilterWidget = {
  id: string;
  path: string;
  label: string;
  type: 'multiselect' | 'slider' | 'datepicker' | 'toggle';
  order: number;
  options?: FilterOption[];
  min?: number | string;
  max?: number | string;
};
