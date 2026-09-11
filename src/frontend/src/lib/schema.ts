/**
 * The five filter dimensions the panel draws, resolved against the filter
 * widgets the API derives from the SHACL shapes.
 *
 * The id list is a UI choice; every label, option and description behind it comes
 * from the ontology, so no option key is ever written down here. Keys are IRIs.
 *
 * entityType leads deliberately. It is the coarsest cut — what KIND of thing this
 * is — so it is the one a visitor reaches for first, and it is what the detail
 * pane's type pill jumps to. It is no longer a section in the accordion, though:
 * the results block draws it as counted pills, where the number of entities
 * behind each type is visible before the choice is made. The design drew four
 * dimensions and left the type unfilterable, stated in words only; that held
 * until it turned out people wanted to filter by it.
 */
import { getFilterWidgets } from '../engine';
import type { FilterOption } from '../engine/namespaces';
import type { IconName } from './icons';

export const DIM_IDS: string[] = [
  'entityType',
  'species',
  'topic',
  'workArea',
  'relatedProject',
];

/** The type dimension. It stays first in DIM_IDS, because that list is the
    authority for URL state, for the empty selection and for anyFilters — but it
    is not drawn as an accordion section: the results block draws it as counted
    pills instead. See components/TypePills.svelte. */
export const TYPE_DIM = 'entityType';

/** The dimensions the accordion stacks — everything the pills do not draw.
    Derived, so adding an id to DIM_IDS puts it in the accordion by default. */
export const SECTION_IDS: string[] = DIM_IDS.filter((id) => id !== TYPE_DIM);

/** An option as the schema carries it. `description` is the concept's
    skos:definition — absent, never empty, when it has none. */
export type Option = FilterOption;

/**
 * The icon each section header carries, keyed by dimension id.
 *
 * A UI choice like DIM_IDS itself, so it lives beside it rather than in
 * lib/icons.ts, which holds geometry and knows nothing about dimensions.
 * Deliberately partial: a dimension added to DIM_IDS without an entry here
 * still renders, keeping its header's column and simply drawing nothing in it.
 * entityType has none — the results block draws it as pills, which carry no
 * icons.
 */
export const DIM_ICONS: Partial<Record<string, IconName>> = {
  species: 'whale',
  topic: 'tag',
  workArea: 'briefcase',
  relatedProject: 'folder',
};

export interface Dim {
  id: string;
  label: string;
  options: Option[];
  /** Undefined for a dimension with no entry in DIM_ICONS. */
  icon?: IconName;
}

export function buildDims(lang: string): Dim[] {
  const widgets = getFilterWidgets(lang);
  return DIM_IDS.map((id) => {
    const dim = widgets.find((w) => w.id === id);
    /* Passed through, not copied field by field: a copy would spell
     `description: o.description` and put the key on every option, undoing the
     backend's care to omit it. */
    return { id, label: dim?.label ?? id, options: dim?.options ?? [], icon: DIM_ICONS[id] };
  });
}
