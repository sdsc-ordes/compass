/**
 * Every string the widget shows, in both languages.
 *
 * Templates take {placeholders} and are filled by fmt() below. The two blocks carry
 * exactly the same keys: the English one is the type the components are written
 * against, so a key missing from `de` is a compile error.
 */
export const i18n = {
  en: {
    srPageTitle: 'OceanCare projects worldwide',
    collapseSidebar: 'Collapse sidebar',
    tallyCaption: 'results in this selection',
    tallyCaptionOne: 'result in this selection',
    /* The line under the story count: what the map is showing those stories
       are drawn from. No trailing stop — it is a caption, not the sentence
       statusResults speaks. */
    tallyResults: '{n} results on the map',
    tallyResultsOne: '{n} result on the map',
    resetFiltersLong: 'Reset filters',
    /* The detail pane's link only. The tally's own link is storiesRead below:
       "Related stories" names a category, which is what the detail pane wants,
       where the tally has just stated the count and wants the invitation. */
    relatedStories: 'Related stories',
    relatedStoriesFrom: 'Related stories from {title}',
    website: 'Website',
    websiteOf: 'Website: {title}',
    newTab: '(opens in a new tab)',
    filterDimensions: 'Filter dimensions',
    dimOptionsCount: '{n} options · {m} selected',
    dimOptionCount: '{n} option · {m} selected',
    dimSelected: '{label}, {n} selected',
    rowCountSr: ', {n} results',
    rowCountSrOne: ', {n} result',
    noProjectsMatch: 'No entries match this selection.',
    loadingMap: 'Loading the map…',
    errorLoad: 'The map could not be loaded: {detail}',
    statusResults: '{n} results on the map.',
    statusResultsFiltered: '{n} results on the map, filtered.',
    storiesInSelection: '{n} stories related to your selection',
    storyInSelection: '1 story related to your selection',
    storiesCaption: 'stories related to your selection',
    storiesCaptionOne: 'story related to your selection',
    storiesPrompt: 'Filter the map to see the stories behind your selection.',
    allStories: 'All stories',
    /* Under the count in the tally box: the count has been stated, so this only
       has to say what to do about it. The pair inflects because "them" does not
       survive a single story. */
    storiesRead: 'Read them here',
    storiesReadOne: 'Read it here',
    attribution: 'Natural Earth 1:50 m',
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
    sheetHow: 'Drag, tap, or use the arrow keys to resize this panel.',
    filterByTag: 'Filter by {label}',
    filterByType: 'filter by this type',
    allTypes: 'All',
    /* A type's name as the filter chips say it, short, in both numbers.
    
       Short because these five chips have to sit in one tidy band in a 420px
       sidebar and a 390px screen, and the ontology's own names do not: nothing
       arranges "Partnerorganisationen" and "Internationale Foren" on a phone
       without either wrapping inside the chip or taking a row each, and both
       read as a mess. The full name is what the chip announces and what the
       detail pane states; this is the filter's shorthand for it.
    
       Keyed by class name, and a class with no entry falls back to the
       ontology's own label at every count — so a new type reads plainly rather
       than breaking. Writing these four keys down is not the usual sin of
       hard-coding an option key: unlike a tag, the set of types is structural,
       and the very same class names are already enumerated literally in the
       SPARQL preamble that BINDs ?type. If that list grows, this one grows
       with it. */
    typeShort: {
      InternationalForum: { one: 'Forum', other: 'Forums' },
      Network: { one: 'Network', other: 'Networks' },
      PartnerOrganization: { one: 'Partner', other: 'Partners' },
      Project: { one: 'Project', other: 'Projects' },
    },
    clusterTitle: '{n} entries here',
    clusterWhere: 'Zoom in to separate them',
  },
  de: {
    srPageTitle: 'OceanCare-Projekte weltweit',
    collapseSidebar: 'Seitenleiste einklappen',
    tallyCaption: 'Ergebnisse in dieser Auswahl',
    tallyCaptionOne: 'Ergebnis in dieser Auswahl',
    tallyResults: '{n} Ergebnisse auf der Karte',
    tallyResultsOne: '{n} Ergebnis auf der Karte',
    resetFiltersLong: 'Filter zurücksetzen',
    relatedStories: 'Verwandte Storys',
    relatedStoriesFrom: 'Verwandte Storys zu {title}',
    website: 'Website',
    websiteOf: 'Website: {title}',
    newTab: '(öffnet in neuem Tab)',
    filterDimensions: 'Filterdimensionen',
    dimOptionsCount: '{n} Optionen · {m} ausgewählt',
    dimOptionCount: '{n} Option · {m} ausgewählt',
    dimSelected: '{label}, {n} ausgewählt',
    rowCountSr: ', {n} Ergebnisse',
    rowCountSrOne: ', {n} Ergebnis',
    noProjectsMatch: 'Keine Einträge für diese Auswahl.',
    loadingMap: 'Karte wird geladen…',
    errorLoad: 'Die Karte konnte nicht geladen werden: {detail}',
    statusResults: '{n} Ergebnisse auf der Karte.',
    statusResultsFiltered: '{n} Ergebnisse auf der Karte, gefiltert.',
    storiesInSelection: '{n} Storys zu Ihrer Auswahl',
    storyInSelection: '1 Story zu Ihrer Auswahl',
    storiesCaption: 'Storys zu Ihrer Auswahl',
    storiesCaptionOne: 'Story zu Ihrer Auswahl',
    storiesPrompt: 'Filtern Sie die Karte, um die Storys zu Ihrer Auswahl zu sehen.',
    allStories: 'Alle Storys',
    /* German needs no plural here: "Hier lesen" carries one story and a hundred
       equally, so both keys hold the same words rather than the pair being
       dropped — the caller inflects and a language that does not still answers. */
    storiesRead: 'Hier lesen',
    storiesReadOne: 'Hier lesen',
    attribution: 'Natural Earth 1:50 m',
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
    coachClick: 'Auf eine Nadel klicken',
    coachTap: 'Auf eine Nadel tippen',
    coachStatic:
      'Ziehen zum Erkunden, scrollen zum Zoomen, auf eine Nadel klicken für Details.',
    filtersPane: 'Filter',
    detailsPane: 'Eintragsdetails',
    backToFilters: 'Zurück zu den Filtern',
    closeEntry: 'Eintrag schliessen',
    stageAria:
      'Weltkarte. Pfeiltasten verschieben, Plus und Minus zoomen, 0 setzt zurück. Tab erreicht jeden Eintrag.',
    sheetHow: 'Ziehen, tippen oder mit den Pfeiltasten die Höhe ändern.',
    filterByTag: 'Nach {label} filtern',
    filterByType: 'nach dieser Art filtern',
    allTypes: 'Alle',
    typeShort: {
      InternationalForum: { one: 'Forum', other: 'Foren' },
      Network: { one: 'Netzwerk', other: 'Netzwerke' },
      /* Same word in both numbers, as German has it. */
      PartnerOrganization: { one: 'Partner', other: 'Partner' },
      Project: { one: 'Projekt', other: 'Projekte' },
    },
    clusterTitle: '{n} Einträge hier',
    clusterWhere: 'Zum Trennen hineinzoomen',
  },
};

export type Lang = 'en' | 'de';

/**
 * The shape every component's `t` prop takes. English is the authority: a key
 * missing from `de` is a compile error, so this is the whole string surface.
 */
export type Strings = (typeof i18n)['en'];

/**
 * "N stories in this selection", singular included. Shared by the tally and the
 * mobile handle, which must not word the same count two ways.
 */
export const storyLine = (n: number, t: Strings): string =>
  n === 1 ? t.storyInSelection : fmt(t.storiesInSelection, { n });

/**
 * The one of two wordings a count takes. English and German both inflect on
 * exactly n === 1, which covers every number this widget shows.
 *
 * The pair-of-keys-plus-helper shape is storyLine's, above: a template cannot
 * carry two wordings, and a language file is the only right place for either.
 */
export const plural = (n: number, one: string, other: string): string =>
  n === 1 ? one : other;

/**
 * What a type chip says for a count — the short name, inflected.
 *
 * The class name is taken off the end of the IRI, which is what typeShort is
 * keyed by and what the SPARQL preamble writes out. A class with no entry there
 * falls back to the ontology's own label, unchanged at every count: a new type
 * then reads plainly instead of not at all.
 */
export const typeLabel = (
  n: number | null,
  iri: string,
  ontology: string,
  t: Strings,
): string => {
  const cut = Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/'));
  const short: Record<string, { one: string; other: string }> = t.typeShort;
  const pair = short[iri.slice(cut + 1)];
  if (!pair) return ontology;
  return n === 1 ? pair.one : pair.other;
};

/** {placeholder} substitution for the templates above. */
export function fmt(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
