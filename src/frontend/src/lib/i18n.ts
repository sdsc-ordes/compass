export type Lang = 'en' | 'de';

const en = {
  srPageTitle: 'OceanCare projects worldwide',
  tallyCaption: 'results',
  tallyCaptionOne: 'result',
  tallyResults: '{n} results on the map',
  tallyResultsOne: '{n} result on the map',
  resetFiltersLong: 'Reset filters',
  relatedStories: 'Related stories',
  relatedStoriesFrom: 'Related stories from {title}',
  website: 'Website',
  websiteOf: 'Website: {title}',
  newTab: '(opens in a new tab)',
  creditBefore: 'Built with',
  creditLove: 'love',
  creditAfter: 'at the',

  filterDimensions: 'Filter dimensions',
  dimOptionsCount: '{n} options · {m} selected',
  dimOptionCount: '{n} option · {m} selected',
  rowCountSr: ', {n} results',
  rowCountSrOne: ', {n} result',
  noProjectsMatch: 'No entries match this selection.',
  loadingMap: 'Loading the map…',
  errorLoad: 'The map could not be loaded: {detail}',
  statusResults: '{n} results on the map.',
  statusResultsFiltered: '{n} results on the map, filtered.',
  storiesCaption: 'stories related to your selection',
  storiesCaptionOne: 'story related to your selection',
  storiesPromptLead: 'Explore OceanCare’s work around the world.',
  storiesPrompt: 'Filter the map for more information.',
  allStories: 'All stories',
  storiesRead: 'Read them here',
  storiesReadOne: 'Read it here',
  attribution: 'Natural Earth 1:50 m',
  attribGebco: 'GEBCO_2026',
  attribGebcoOf: 'GEBCO_2026 Grid: source and terms of use',
  seafloor: 'Seafloor',
  seafloorOn: 'On',
  seafloorOff: 'Off',
  projection: 'Projection',
  flatMap: 'Map',
  globeMap: 'Globe',
  theme: 'Theme',
  themeLight: 'Light',
  themeDark: 'Dark',
  language: 'Language',
  mapSettings: 'Map settings',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  resetViewAria: 'Reset view',
  coachDrag: 'Drag to explore',
  coachScroll: 'Scroll to zoom',
  coachPinch: 'Pinch to zoom',
  coachClick: 'Click a pin',
  coachTap: 'Tap a pin',
  coachStatic: 'Drag to explore the map, scroll to zoom, and click a pin for details.',
  filtersPane: 'Filters',
  detailsPane: 'Entry details',
  backToFilters: 'Back to filters',
  closeEntry: 'Close entry',
  stageAria:
    'World map. Arrow keys pan, plus and minus zoom, 0 resets. Tab reaches each entry.',
  sheetHow:
    'Tap or press Enter to switch an entry between half and full height, or the filters between docked and full. Swipe up or press the up arrow to expand, swipe down or press the down arrow to step back or close, and press Escape to close.',
  filterByTag: 'Filter by {label}',
  filterByType: 'filter by this type',
  activeFilters: 'Active filters',
  activeFilterOne: 'active filter',
  activeFilterMany: 'active filters',
  clearFilters: 'Clear',
  removeFilter: 'Remove {label}',
  moreFilters: '{n} more: {labels}',
  allTypes: 'All',
  typeShort: {
    InternationalForum: 'International Fora',
    Network: 'Networks',
    PartnerOrganization: 'Partners',
  },
  clusterTitle: '{n} entries here',
  clusterWhere: 'Zoom in to separate them',
};

export type Strings = typeof en;

const de: Strings = {
  srPageTitle: 'OceanCare-Projekte weltweit',
  tallyCaption: 'Ergebnisse',
  tallyCaptionOne: 'Ergebnis',
  tallyResults: '{n} Ergebnisse auf der Karte',
  tallyResultsOne: '{n} Ergebnis auf der Karte',
  resetFiltersLong: 'Filter zurücksetzen',
  relatedStories: 'Verwandte Storys',
  relatedStoriesFrom: 'Verwandte Storys zu {title}',
  website: 'Website',
  websiteOf: 'Website: {title}',
  newTab: '(öffnet in neuem Tab)',
  creditBefore: 'Mit',
  creditLove: 'Liebe',
  creditAfter: 'kreiert am',

  filterDimensions: 'Filter Optionen',
  dimOptionsCount: '{n} Filter · {m} ausgewählt',
  dimOptionCount: '{n} Option · {m} ausgewählt',
  rowCountSr: ', {n} Ergebnisse',
  rowCountSrOne: ', {n} Ergebnis',
  noProjectsMatch: 'Keine Einträge für diese Auswahl.',
  loadingMap: 'Karte wird geladen…',
  errorLoad: 'Die Karte konnte nicht geladen werden: {detail}',
  statusResults: '{n} Ergebnisse auf der Karte.',
  statusResultsFiltered: '{n} Ergebnisse auf der Karte, gefiltert.',
  storiesCaption: 'Storys zu Ihrer Auswahl',
  storiesCaptionOne: 'Story zu Ihrer Auswahl',
  storiesPromptLead: 'Entdecken Sie die weltweite Arbeit von OceanCare.',
  storiesPrompt: 'Filtern Sie die Karte für weitere Informationen.',
  allStories: 'Alle Storys',
  storiesRead: 'Hier lesen',
  storiesReadOne: 'Hier lesen',
  attribution: 'Natural Earth 1:50 m',
  attribGebco: 'GEBCO_2026',
  attribGebcoOf: 'GEBCO_2026-Gitter: Quelle und Nutzungsbedingungen',
  seafloor: 'Meeresboden',
  seafloorOn: 'Ein',
  seafloorOff: 'Aus',
  projection: 'Projektion',
  flatMap: 'Karte',
  globeMap: 'Globus',
  theme: 'Darstellung',
  themeLight: 'Hell',
  themeDark: 'Dunkel',
  language: 'Sprache',
  mapSettings: 'Karteneinstellungen',
  zoomIn: 'Vergrössern',
  zoomOut: 'Verkleinern',
  resetViewAria: 'Ansicht zurücksetzen',
  coachDrag: 'Ziehen zum Erkunden',
  coachScroll: 'Scrollen zum Zoomen',
  coachPinch: 'Zwei Finger zum Zoomen',
  coachClick: 'Auf einen Pin klicken',
  coachTap: 'Auf einen Pin tippen',
  coachStatic: 'Ziehen zum Erkunden, scrollen zum Zoomen, auf einen Pin klicken für Details.',
  filtersPane: 'Filter',
  detailsPane: 'Eintragsdetails',
  backToFilters: 'Zurück zu den Filtern',
  closeEntry: 'Eintrag schliessen',
  stageAria:
    'Weltkarte. Pfeiltasten verschieben, Plus und Minus zoomen, 0 setzt zurück. Tab erreicht jeden Eintrag.',
  sheetHow:
    'Tippen oder Enter wechselt einen Eintrag zwischen halber und voller Höhe, die Filter zwischen angedockt und voller Höhe. Nach oben wischen oder Pfeil nach oben vergrössert, nach unten wischen oder Pfeil nach unten geht einen Schritt zurück oder schliesst, Escape schliesst.',
  filterByTag: 'Nach {label} filtern',
  filterByType: 'nach dieser Art filtern',
  activeFilters: 'Aktive Filter',
  activeFilterOne: 'aktiver Filter',
  activeFilterMany: 'aktive Filter',
  clearFilters: 'Löschen',
  removeFilter: '{label} entfernen',
  moreFilters: '{n} weitere: {labels}',
  allTypes: 'Alle',
  typeShort: {
    InternationalForum: 'Internationale Foren',
    Network: 'Netzwerke',
    PartnerOrganization: 'Partner',
  },
  clusterTitle: '{n} Einträge hier',
  clusterWhere: 'Zum Trennen hineinzoomen',
};

export const i18n: Record<Lang, Strings> = { en, de };

export const plural = (n: number, one: string, other: string): string =>
  n === 1 ? one : other;

/**
 * Return the short plural pill label for an entity type IRI, whatever the
 * count, or `fallback` for a type without one.
 */
export const typeLabel = (iri: string, fallback: string, t: Strings): string => {
  const cut = Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/'));
  const short: Record<string, string> = t.typeShort;
  return short[iri.slice(cut + 1)] ?? fallback;
};

/** Fill `{name}` placeholders from `vars`; unknown names are left as written. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** Format a load failure with `t.errorLoad`. */
export const loadErrorText = (t: Strings, e: unknown): string =>
  fmt(t.errorLoad, { detail: e instanceof Error ? e.message : String(e) });
