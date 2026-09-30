<svelte:options customElement="compass-map" />

<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import Sidebar from './Sidebar.svelte';
  import Stage from './Stage.svelte';
  import ActivePills from './ActivePills.svelte';
  import { Sheet, isMobile } from '../lib/sheet';
  import { DIM_IDS, SECTION_IDS, TYPE_DIM, buildDims } from '../lib/schema';
  import { toEntries } from '../lib/features';
  import { isHost } from '../lib/pins';
  import { Stories, type StoryCount } from '../lib/stories';
  import type { Entry } from '../lib/types';
  import { getEntities, getFacets, init, prefetch, type Feature } from '../engine';
  import { injectFonts } from '../lib/fonts';
  import {
    decodeFilters,
    decodePin,
    encodePin,
    langFromQuery,
    syncUrl,
    type QueryFilters,
  } from '../lib/urlstate';
  import { fmt, i18n, loadErrorText, type Lang } from '../lib/i18n';
  import { styles } from '../lib/styles';

  export let apiurl = '';
  export let tileurl = '';
  export let lang: Lang = 'en';

  type Sel = Record<string, Set<string>>;

  function emptySel(): Sel {
    const next: Sel = {};
    for (const id of DIM_IDS) next[id] = new Set<string>();
    return next;
  }

  let sel: Sel = emptySel();
  let openDim: string | null = SECTION_IDS[0];
  let entities: Feature[] = [];
  let facets: Record<string, Record<string, number>> = {};
  let loading = true;
  let error: string | null = null;
  let mounted = false;
  let selectedId: string | null = null;
  let night = false;
  let juston: string | null = null;
  let justonTimer: ReturnType<typeof setTimeout> | null = null;
  // ?pin= token, held until the first load can resolve it.
  let pendingPin: string | null = null;

  $: t = i18n[lang] || i18n.en;

  let mapcEl: HTMLElement;
  let backdropEl: HTMLElement;
  let sidebarEl: HTMLElement | null = null;
  let grabEl: HTMLElement | null = null;
  let tallyEl: HTMLElement | null = null;
  let titleEl: HTMLHeadingElement | null = null;
  let sidebarComp: Sidebar | null = null;
  let stageComp: Stage | null = null;
  let sheet: Sheet | null = null;

  $: dims = mounted ? buildDims(lang) : [];

  $: filters = Object.fromEntries(
    DIM_IDS.filter((id) => sel[id].size > 0).map((id) => [id, [...sel[id]]]),
  ) as QueryFilters;

  $: anyFilters = DIM_IDS.some((id) => sel[id].size > 0);

  $: entries = toEntries(entities);
  // Every pin the API returns, so the number always describes what is drawn.
  $: resultCount = entries.length;
  // The backend never counts always-on pins. They carry every tag, so they are
  // added to every tag count, but they belong to none of the entity types.
  $: hostCount = entries.filter(isHost).length;
  $: shownFacets = Object.fromEntries(
    dims
      .filter((d) => facets[d.id])
      .map((d) => {
        const counts = facets[d.id];
        const extra = d.id === TYPE_DIM ? 0 : hostCount;
        return [
          d.id,
          Object.fromEntries(d.options.map((o) => [o.value, (counts[o.value] ?? 0) + extra])),
        ];
      }),
  );
  $: pinToken = selectedId
    ? encodePin(
        selectedId,
        entries.map((p) => p.id),
      )
    : pendingPin;
  $: if (mounted) syncUrl(filters, lang, dims, pinToken);

  $: selected = selectedId ? (entries.find((p) => p.id === selectedId) ?? null) : null;

  $: statusText = error
    ? error
    : loading && entities.length === 0
      ? ''
      : resultCount === 0
        ? t.noProjectsMatch
        : fmt(anyFilters ? t.statusResultsFiltered : t.statusResults, { n: resultCount });

  let loadSeq = 0;
  const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

  // The map reframes only on a filter change: not on the first load, nor on a language switch.
  const filterKey = (f: QueryFilters): string =>
    JSON.stringify(DIM_IDS.map((id) => [...(f[id] ?? [])].sort()));

  let lastFilterKey: string | null = null;
  let focusKey = 0;

  async function loadData(l: Lang, f: QueryFilters): Promise<void> {
    const seq = ++loadSeq;
    const key = filterKey(f);
    const reframe = lastFilterKey !== null && key !== lastFilterKey;
    lastFilterKey = key;
    loading = true;
    error = null;
    // Both at once; the counts still land after the map has had its frame.
    const counting = getFacets(l, f);
    counting.catch(() => {}); // reported below, unless the entities fail first
    try {
      const data = await getEntities(l, f);
      if (seq !== loadSeq) return;
      entities = data.features;
      if (pendingPin) {
        selectedId = decodePin(
          pendingPin,
          toEntries(entities).map((p) => p.id),
        );
        pendingPin = null;
      }
      if (selectedId && !entities.some((e) => e.properties?.id === selectedId)) {
        selectedId = null;
      }
      if (reframe) focusKey += 1;
      loading = false;

      await yieldToBrowser();
      const counts = await counting;
      if (seq !== loadSeq) return;
      facets = counts;
    } catch (e) {
      if (seq !== loadSeq) return;
      console.error('[Compass] Query failed:', e);
      error = loadErrorText(t, e);
    } finally {
      if (seq === loadSeq) loading = false;
    }
  }

  $: if (mounted) loadData(lang, filters);

  let storyCount: StoryCount | null = null;
  let storiesPending = false;
  const stories = new Stories(
    (c) => (storyCount = c),
    (p) => (storiesPending = p),
  );

  // Stories are tagged by topic etc., never by entity type.
  $: storyTagIris = DIM_IDS.filter((id) => id !== TYPE_DIM)
    .flatMap((id) => [...sel[id]])
    .filter((v) => v.startsWith('http'));

  $: stories.schedule(mounted, apiurl, lang, storyTagIris);

  function toggleOption(dim: string, iri: string, el?: HTMLElement): void {
    const s = sel[dim];
    if (s.has(iri)) s.delete(iri);
    else s.add(iri);
    sel = { ...sel };
    sheet?.showMap(el);
  }

  function reset(): void {
    sel = emptySel();
    sheet?.showMap();
  }

  function pickType(iri: string | null, el?: HTMLElement): void {
    const current = sel[TYPE_DIM];
    const same = iri !== null && current.size === 1 && current.has(iri);
    sel[TYPE_DIM] = new Set(iri === null || same ? [] : [iri]);
    sel = { ...sel };
    sheet?.showMap(el);
  }

  function toggleDim(id: string): void {
    if (openDim === id) {
      openDim = null;
      return;
    }
    openDim = id;
    sheet?.onSectionOpened();
  }

  function filterByTag(dim: string, iri: string): void {
    if (!dims.find((d) => d.id === dim)?.options.some((o) => o.value === iri)) return;
    dismissEntry();
    const isType = dim === TYPE_DIM;
    if (isType) sel[dim] = new Set([iri]);
    else {
      sel[dim].add(iri);
      openDim = dim;
    }
    sel = { ...sel };
    if (sheet?.mobile) sheet.to('half');
    juston = dim + iri;
    tick().then(() => (isType ? sidebarComp?.focusPill(iri) : sidebarComp?.focusRow(dim, iri)));
    if (justonTimer) clearTimeout(justonTimer);
    justonTimer = setTimeout(() => {
      justonTimer = null;
      juston = null;
    }, 1800);
  }

  function selectEntry(p: Entry | null): void {
    if (p) selectedId = p.id;
    else dismissEntry();
  }

  function settledStageWidth(): number {
    if (!mapcEl || isMobile()) return 0;
    const rail = parseFloat(getComputedStyle(mapcEl).getPropertyValue('--rail')) || 0;
    return Math.max(0, mapcEl.clientWidth - rail);
  }

  function dismissEntry(): void {
    if (selectedId) {
      const root = mapcEl?.getRootNode() as ShadowRoot | Document | undefined;
      const focusInDetail = !!root?.activeElement?.closest('.pane-detail');
      selectedId = null;
      // on a phone, the grab: a header below the dock would lift the sheet
      if (focusInDetail)
        tick().then(() =>
          sheet?.mobile
            ? grabEl?.focus({ preventScroll: true })
            : sidebarComp?.focusHeader(openDim ?? SECTION_IDS[0]),
        );
    }
    if (sheet?.mobile) sheet.to('dock');
  }

  let lastSelectedId: string | null = null;
  $: if (selectedId !== lastSelectedId) {
    const had = lastSelectedId;
    lastSelectedId = selectedId;
    if (selectedId) onEntryOpened(!!had);
    else if (had) toTop();
  }

  // Both panes share one scroller. Reset it after the DOM swap, not in the reactive
  // block, or the outgoing pane visibly jumps.
  async function toTop(): Promise<void> {
    await tick();
    if (sidebarEl) sidebarEl.scrollTop = 0;
  }

  // A swap from one entry to another keeps the stop the sheet is at.
  async function onEntryOpened(swap: boolean): Promise<void> {
    if (sheet?.mobile && !swap) sheet.to('half');
    await toTop();
    titleEl?.focus({ preventScroll: true });
  }

  onMount(async () => {
    injectFonts();
    const params = new URLSearchParams(window.location.search);
    lang = langFromQuery(params) ?? lang;

    pendingPin = params.get('pin');
    const schema = init(apiurl);
    // Filters in the URL need the schema to decode; an unfiltered start does not.
    if (pendingPin || !DIM_IDS.some((id) => params.has(id))) prefetch(lang, {});
    try {
      await schema;
    } catch (e) {
      console.error('[Compass] Failed to load the filter schema:', e);
      error = loadErrorText(t, e);
    }
    // A pin link opens unfiltered, so the pin is always among the results.
    if (!pendingPin) applyFilters(decodeFilters(params, buildDims(lang)));

    sheet = new Sheet({
      mapc: mapcEl,
      sidebar: sidebarEl as HTMLElement,
      grab: grabEl as HTMLElement,
      backdrop: backdropEl,
      dockFloor: tallyEl as HTMLElement,
      stage: mapcEl.querySelector('.stage') as HTMLElement,
      isDetail: () => !!selectedId,
      queue: (full) => stageComp?.refresh(full),
      dismiss: dismissEntry,
    });
    sheet.wire();

    mounted = true;
  });

  function applyFilters(f: QueryFilters): void {
    const next = emptySel();
    for (const [id, values] of Object.entries(f)) {
      values.forEach((v) => next[id].add(v));
    }
    sel = next;
  }

  onDestroy(() => {
    if (justonTimer) clearTimeout(justonTimer);
    sheet?.destroy();
    stories.cancel();
  });

  function onRootKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') dismissEntry();
  }
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html `<style>${styles}</style>`}

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<main class="mapc" class:night bind:this={mapcEl} on:keydown={onRootKey}>
  <h1 class="sr">{t.srPageTitle}</h1>
  <div class="sheet-backdrop" bind:this={backdropEl} aria-hidden="true"></div>

  <Sidebar
    bind:this={sidebarComp}
    {t}
    {dims}
    {openDim}
    {sel}
    facets={shownFacets}
    {resultCount}
    {storyCount}
    {storiesPending}
    {statusText}
    {selected}
    {juston}
    onToggleDim={toggleDim}
    onToggleOption={toggleOption}
    onPickType={pickType}
    onReset={reset}
    onBack={dismissEntry}
    onCloseDetail={dismissEntry}
    onFilterByTag={filterByTag}
    bind:sidebarEl
    bind:grabEl
    bind:tallyEl
    bind:titleEl
  />

  <Stage
    bind:this={stageComp}
    {t}
    {lang}
    {tileurl}
    {entries}
    {selected}
    {loading}
    {error}
    {focusKey}
    onSelect={selectEntry}
    onTheme={(n) => (night = n)}
    onLang={(l) => (lang = l)}
    lift={() => sheet?.lift() ?? 0}
    band={() => sheet?.band() ?? null}
    sheetEl={sidebarEl}
    settledWidth={settledStageWidth}
  >
    <ActivePills bar {t} {dims} {sel} onToggleOption={toggleOption} />
  </Stage>
</main>
