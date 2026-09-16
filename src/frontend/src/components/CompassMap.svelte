<svelte:options customElement="compass-map" />

<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import Sidebar from './Sidebar.svelte';
  import Stage from './Stage.svelte';
  import { Sheet, isMobile } from '../lib/sheet';
  import { DIM_IDS, SECTION_IDS, TYPE_DIM, buildDims } from '../lib/schema';
  import { toProjs } from '../lib/features';
  import { Stories, type StoryCount } from '../lib/stories';
  import type { Proj } from '../lib/types';
  import { getEntities, getFacets, init, type Feature } from '../engine';
  import { injectFonts } from '../lib/fonts';
  import {
    filtersFromQuery,
    langFromQuery,
    pickDimensions,
    syncUrl,
    type QueryFilters,
  } from '../lib/urlstate';
  import { prefersDark } from '../lib/projection';
  import { fmt, i18n, type Lang } from '../lib/i18n';
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
  let night = prefersDark();
  let juston: string | null = null;

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

  $: projs = toProjs(entities);
  $: resultCount = projs.length;
  $: selected = selectedId ? (projs.find((p) => p.id === selectedId) ?? null) : null;

  $: statusText = error
    ? error
    : loading && entities.length === 0
      ? ''
      : resultCount === 0
        ? t.noProjectsMatch
        : fmt(anyFilters ? t.statusResultsFiltered : t.statusResults, { n: resultCount });

  let loadSeq = 0;
  const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function loadData(l: Lang, f: QueryFilters): Promise<void> {
    const seq = ++loadSeq;
    loading = true;
    error = null;
    syncUrl(f, l, DIM_IDS);
    try {
      const data = await getEntities(l, f);
      if (seq !== loadSeq) return;
      entities = data.features;
      if (selectedId && !entities.some((e) => e.properties?.id === selectedId)) {
        selectedId = null;
      }
      loading = false;

      await nextTick();
      const counts = await getFacets(l, f);
      if (seq !== loadSeq) return;
      facets = counts;
    } catch (e) {
      if (seq !== loadSeq) return;
      console.error('[Compass] Query failed:', e);
      error = fmt(t.errorLoad, { detail: e instanceof Error ? e.message : String(e) });
    } finally {
      if (seq === loadSeq) loading = false;
    }
  }

  $: if (mounted) loadData(lang, filters);

  let storyCount: StoryCount | null = null;
  let storiesPending = false;
  const stories = new Stories(
    (c) => {
      storyCount = c;
    },
    (p) => {
      storiesPending = p;
    },
  );

  $: storyTagIris = DIM_IDS.filter((id) => id !== TYPE_DIM)
    .flatMap((id) => [...sel[id]])
    .filter((v) => v.startsWith('http'));

  $: stories.schedule(mounted, apiurl, lang, storyTagIris);

  function toggleOption(dim: string, iri: string): void {
    const s = sel[dim];
    if (s.has(iri)) s.delete(iri);
    else s.add(iri);
    sel = { ...sel };
  }

  function reset(): void {
    sel = emptySel();
  }

  function pickType(iri: string | null): void {
    const held = sel[TYPE_DIM];
    const same = iri !== null && held.size === 1 && held.has(iri);
    sel[TYPE_DIM] = new Set(iri === null || same ? [] : [iri]);
    sel = { ...sel };
  }

  function toggleDim(id: string): void {
    if (openDim === id) {
      openDim = null;
      return;
    }
    openDim = id;
    sheet?.onSectionOpened();
  }

  const anchorDim = (): string => openDim ?? SECTION_IDS[0];

  function filterByTag(dim: string, iri: string): void {
    if (!DIM_IDS.includes(dim)) return;
    if (!dims.find((d) => d.id === dim)?.options.some((o) => o.value === iri)) return;
    dismissEntry();
    if (dim === TYPE_DIM) sel[dim] = new Set([iri]);
    else sel[dim].add(iri);
    sel = { ...sel };
    const isType = dim === TYPE_DIM;
    if (!isType) openDim = dim;
    if (sheet?.mobile) sheet.to('half');
    juston = dim + iri;
    tick().then(() => (isType ? sidebarComp?.focusPill(iri) : sidebarComp?.focusRow(dim, iri)));
    setTimeout(() => {
      juston = null;
    }, 1800);
  }

  async function openEntry(p: Proj): Promise<void> {
    selectedId = p.id;
  }

  function settledStageWidth(): number {
    if (!mapcEl || isMobile()) return 0;
    const total = mapcEl.clientWidth;
    if (!total) return 0;
    const rail = parseFloat(getComputedStyle(mapcEl).getPropertyValue('--rail')) || 0;
    return Math.max(0, total - rail);
  }

  function dismissEntry(): void {
    if (selectedId) {
      const root = mapcEl?.getRootNode() as ShadowRoot | Document | undefined;
      const active = (root as ShadowRoot | null)?.activeElement as HTMLElement | null;
      const held = !!active?.closest?.('.pane-detail');
      selectedId = null;
      if (held) tick().then(() => sidebarComp?.focusHeader(anchorDim()));
    }
    if (sheet?.mobile) sheet.to('dock');
  }

  let lastSelectedId: string | null = null;
  $: if (selectedId !== lastSelectedId) {
    const had = lastSelectedId;
    lastSelectedId = selectedId;
    if (selectedId) onEntryOpened();
    // Coming back, the filters inherit however far the detail was scrolled,
    // which lands the reader somewhere in the middle of a list they never left.
    else if (had && sidebarEl) sidebarEl.scrollTop = 0;
  }

  async function onEntryOpened(): Promise<void> {
    if (sidebarEl) sidebarEl.scrollTop = 0;
    if (sheet?.mobile) sheet.to('detail');
    await tick();
    titleEl?.focus({ preventScroll: true });
  }

  onMount(async () => {
    injectFonts();
    const params = new URLSearchParams(window.location.search);
    lang = langFromQuery(params) ?? lang;

    applyFilters(filtersFromQuery(params));

    try {
      await init(apiurl);
    } catch (e) {
      console.error('[Compass] Failed to load the filter schema:', e);
      error = fmt(t.errorLoad, { detail: e instanceof Error ? e.message : String(e) });
    }

    sheet = new Sheet({
      mapc: mapcEl,
      sidebar: sidebarEl as HTMLElement,
      grab: grabEl as HTMLElement,
      backdrop: backdropEl,
      dockFloor: tallyEl as HTMLElement,
      stage: mapcEl.querySelector('.stage') as HTMLElement,
      isDetail: () => !!selectedId,
      queue: (full) => stageComp?.refresh(full),
      dismiss: () => dismissEntry(),
    });
    sheet.wire();

    mounted = true;
  });

  function applyFilters(f: Record<string, unknown>): void {
    const next = emptySel();
    for (const [id, values] of Object.entries(pickDimensions(f, DIM_IDS))) {
      values.forEach((v) => next[id].add(v));
    }
    sel = next;
  }

  onDestroy(() => {
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
    {facets}
    {resultCount}
    {storyCount}
    {storiesPending}
    {statusText}
    {anyFilters}
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
    {projs}
    {selected}
    {loading}
    {error}
    onSelect={(p) => (p ? openEntry(p) : dismissEntry())}
    onTheme={(n) => (night = n)}
    onLang={(l) => (lang = l)}
    lift={() => sheet?.lift() ?? 0}
    sheetEl={sidebarEl}
    {isMobile}
    settledWidth={settledStageWidth}
  />
</main>
