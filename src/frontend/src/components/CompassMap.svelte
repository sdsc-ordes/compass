<svelte:options customElement="compass-map" />

<script lang="ts">
  /**
   * <compass-map lang="en" apiurl=""> — the widget's one custom element.
   *
   * Every other component is a plain Svelte component, so the whole UI shares this
   * element's single shadow root and nothing needs :global().
   */
  import { onMount, onDestroy, tick } from 'svelte';
  import Sidebar from './Sidebar.svelte';
  import Stage from './Stage.svelte';
  import { Sheet, isMobile, onMobileChange } from '../lib/sheet';
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
  import { prefersDark, REDUCED } from '../lib/projection';
  import { fmt, i18n, type Lang } from '../lib/i18n';
  import { styles } from '../lib/styles';

  /** Where the API lives. The map's data comes from it, as does the story count;
      empty means this page's own origin, which is how the nginx image serves it. */
  export let apiurl = '';
  export let lang: Lang = 'en';

  /** The selection, per dimension. A set, so a row toggles without a scan. */
  type Sel = Record<string, Set<string>>;

  function emptySel(): Sel {
    const next: Sel = {};
    for (const id of DIM_IDS) next[id] = new Set<string>();
    return next;
  }

  let sel: Sel = emptySel();
  /**
   * Which dimension has its accordion section open. One at a time, or none.
   *
   * One id and not a set of them: only ever one section stands open, and holding
   * that in a string makes it so, where a set could only be asked nicely by
   * every place that assigns one. Opening a section is therefore also what
   * closes the last, and nothing else has to arrange it.
   *
   * SECTION_IDS[0], not DIM_IDS[0]: the type leads DIM_IDS and is drawn as pills
   * above the accordion rather than as a section in it.
   *
   * Not in the query string: syncUrl writes selections and the language, and the
   * dimension that happened to be showing was never part of a shared link.
   */
  let openDim: string | null = SECTION_IDS[0];
  let entities: Feature[] = [];
  let facets: Record<string, Record<string, number>> = {};
  let loading = true;
  let error: string | null = null;
  let mounted = false;
  let selectedId: string | null = null;
  let collapsed = false;
  /* Read from the same source as Stage's own initial value rather than waiting
     for its onTheme callback, so .mapc.night is right on the very first paint. */
  let night = prefersDark();
  let juston: string | null = null;

  $: t = i18n[lang] || i18n.en;

  /* ---------- element refs ---------- */
  let mapcEl: HTMLElement;
  let backdropEl: HTMLElement;
  let sidebarEl: HTMLElement | null = null;
  let grabEl: HTMLElement | null = null;
  /* Still a node, because Sheet measures the tally for its dock height. */
  let tallyEl: HTMLElement | null = null;
  let titleEl: HTMLHeadingElement | null = null;
  let sidebarComp: Sidebar | null = null;
  let stageComp: Stage | null = null;
  let sheet: Sheet | null = null;

  /* The dimensions in DIM_IDS order; labels and options from the API's widgets.
     Gated on `mounted`, which onMount sets only once init() has fetched them —
     without the gate this runs once against an empty engine and never again,
     because `lang` alone is not enough to make it re-evaluate. */
  $: dims = mounted ? buildDims(lang) : [];

  /** The engine's Filters shape: dimension id -> selected IRIs. */
  $: filters = Object.fromEntries(
    DIM_IDS.filter((id) => sel[id].size > 0).map((id) => [id, [...sel[id]]]),
  ) as QueryFilters;

  $: anyFilters = DIM_IDS.some((id) => sel[id].size > 0);

  $: projs = toProjs(entities);
  $: resultCount = projs.length;
  $: selected = selectedId ? (projs.find((p) => p.id === selectedId) ?? null) : null;

  /* One sentence for everything a filter change rewrote. Silent until the first
     query answers, so it never announces an empty map that never existed.

     A failure leads, and it comes through here rather than through a second live
     region: the stage plate below is the visible half, this is the spoken one. */
  $: statusText = error
    ? error
    : loading && entities.length === 0
      ? ''
      : resultCount === 0
        ? t.noProjectsMatch
        : fmt(anyFilters ? t.statusResultsFiltered : t.statusResults, { n: resultCount });

  /* ---------- query lifecycle: load-bearing, easy to break by tidying ----------
     Two requests per change, and the filters can change again before either
     lands: drop the sequence counter and a slower earlier response overwrites a
     faster later one. The yield before the facet request is what lets the map
     paint the new pins before the counts are asked for. */
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
      /* A filter change can orphan the selection. Done here rather than reactively,
       which would make `selected` and `selectedId` chase each other. */
      if (selectedId && !entities.some((e) => e.properties?.id === selectedId)) {
        selectedId = null;
      }
      loading = false;

      /* Facets only drive row counts, so let the map paint first. */
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

  /* ---------- story count: the one thing here that needs a backend ---------- */
  let storyCount: StoryCount | null = null;
  const stories = new Stories((c) => {
    storyCount = c;
  });

  /**
   * Every tag IRI currently active, entityType excluded.
   *
   * The backend contract for /api/stories/count takes tag IRIs, and a type is not
   * one: nothing on oceancare.org is tagged "Partner Organization". Sending it
   * would narrow the count by a term the story index cannot match and quietly
   * return zero. It stays a filter dimension here and not a story term.
   */
  $: storyTagIris = DIM_IDS.filter((id) => id !== TYPE_DIM)
    .flatMap((id) => [...sel[id]])
    .filter((v) => v.startsWith('http'));

  /* Armed through Stories, never from this statement's body: see Stories.schedule. */
  $: stories.schedule(mounted, apiurl, lang, storyTagIris);

  /* ---------- filter actions ---------- */
  function toggleOption(dim: string, iri: string): void {
    const s = sel[dim];
    if (s.has(iri)) s.delete(iri);
    else s.add(iri);
    sel = { ...sel };
  }

  function reset(): void {
    sel = emptySel();
  }

  /**
   * Chooses one entity type, or every type when the IRI is null.
   *
   * One at a time, unlike every other dimension: pressing a type replaces
   * whatever the type filter held rather than adding to it, and pressing the one
   * already chosen clears it back to all. Four independent toggles read as "some
   * subset of types is on", which is not how anyone expects the coarsest cut in
   * the data to behave — and an empty set already means every type, so there is
   * nothing to express that this cannot.
   */
  function pickType(iri: string | null): void {
    const held = sel[TYPE_DIM];
    const same = iri !== null && held.size === 1 && held.has(iri);
    sel[TYPE_DIM] = new Set(iri === null || same ? [] : [iri]);
    sel = { ...sel };
  }

  /** Opens one dimension's section, which closes whichever was open; pressing
      the open one shuts it and leaves none. */
  function toggleDim(id: string): void {
    if (openDim === id) {
      openDim = null;
      return;
    }
    openDim = id;
    /* Asking for a dimension's options asks for room to read them. The dock shows
       the handle and the tally only, so this fires for a keyboard visitor who has
       tabbed down to a header the dock is clipping. */
    sheet?.onSectionOpened();
  }

  /** Where the caret goes when an entry closes: the open section's header, or the
      first dimension's when none is open. The tab strip sent it to whichever tab
      was active, and the open section is that landmark here. */
  const anchorDim = (): string => openDim ?? SECTION_IDS[0];

  /** A tag in the detail is the route back into the filters: it puts the entry
      away, switches the tag on, and takes the caret to wherever that tag is
      drawn — a row inside its section, or, for the type, its pill in the
      results block. */
  function filterByTag(dim: string, iri: string): void {
    if (!DIM_IDS.includes(dim)) return;
    if (!dims.find((d) => d.id === dim)?.options.some((o) => o.value === iri)) return;
    dismissEntry();
    /* The type is one-of-many wherever it is set, this route included: arriving
       from an entry's type pill means "show me these", not "add these to the
       types I already had". */
    if (dim === TYPE_DIM) sel[dim] = new Set([iri]);
    else sel[dim].add(iri);
    sel = { ...sel };
    /* The type has no section: its pill is above the accordion and already in
       view, so there is nothing to open and nothing to wait for. */
    const isType = dim === TYPE_DIM;
    /* Its own section, which is what closes whichever was open. The row is about
       to be scrolled to on purpose, so nothing here has to hold it still. */
    if (!isType) openDim = dim;
    /* The detail stop has no filters to show — pills included. */
    if (sheet?.mobile) sheet.to('half');
    /* The row, or the pill, marks itself until the eye has found it. */
    juston = dim + iri;
    /* After the flush, so a section is no longer inert and its rows exist. The
       scroll to the row waits again inside there, for the section to finish
       opening — see FilterAccordion.focusRow. */
    tick().then(() => (isType ? sidebarComp?.focusPill(iri) : sidebarComp?.focusRow(dim, iri)));
    setTimeout(() => {
      juston = null;
    }, 1800);
  }

  /* ---------- selection ---------- */
  async function openEntry(p: Proj): Promise<void> {
    /* The panel comes back BEFORE the selection, and awaiting it is the point:
       openRail() reveals the width and lets Stage absorb that resize before the
       flight is ever aimed, so the flight starts from a view that has not
       visibly moved and is then the only thing the eye has to follow. The panel
       slides across on its own while it flies. */
    if (collapsed || railOut) await setCollapsed(false);
    selectedId = p.id;
  }

  /**
   * What the stage's width will be once the sidebar has finished moving.
   *
   * 0 means "no different from now": on mobile the panel is a bottom sheet and
   * takes no width, and with the rail already open the live width is right.
   * Read from --rail so the number lives in one place, in the CSS that uses it.
   */
  function settledStageWidth(): number {
    if (!mapcEl || isMobile()) return 0;
    const total = mapcEl.clientWidth;
    if (!total || collapsed) return 0;
    const rail = parseFloat(getComputedStyle(mapcEl).getPropertyValue('--rail')) || 0;
    return Math.max(0, total - rail);
  }

  /** One way out of an entry: close, back, Escape, bare map, backdrop, swipe. */
  function dismissEntry(): void {
    if (selectedId) {
      /* Only when focus is inside the pane about to be hidden: a filter change also
       lands here, and there focus belongs to the row the visitor is using. */
      const root = mapcEl?.getRootNode() as ShadowRoot | Document | undefined;
      const active = (root as ShadowRoot | null)?.activeElement as HTMLElement | null;
      const held = !!active?.closest?.('.pane-detail');
      selectedId = null;
      /* Back to the filter accordion, rather than to nothing. */
      if (held) tick().then(() => sidebarComp?.focusHeader(anchorDim()));
    }
    if (sheet?.mobile) sheet.to('dock');
  }

  let lastSelectedId: string | null = null;
  $: if (selectedId !== lastSelectedId) {
    lastSelectedId = selectedId;
    if (selectedId) onEntryOpened();
  }

  async function onEntryOpened(): Promise<void> {
    if (sidebarEl) sidebarEl.scrollTop = 0;
    /* A tap on a pin answers with the entry itself, at the height where the name,
       the tags and the type are all readable. */
    if (sheet?.mobile) sheet.to('detail');
    /* The sidebar precedes the stage in the DOM, so the pane that just opened sits
       earlier in the tab order than whatever opened it. */
    await tick();
    titleEl?.focus({ preventScroll: true });
  }

  /* ---------- collapse ----------
     Two states, because the panel slides on transform while its width snaps:

       `collapsed`  the settled closed state — width 0, stage has the frame
       `railOut`    travelling — full width still reserved, panel off to the left

     The slide runs between railOut and neither; the width change happens on the
     far side of it, where the panel is off screen and nothing can be seen
     moving. Animating width instead would resize the stage every frame, and
     proj() re-fits the map to the stage — which is what made the map crawl.
     styles/sidebar.css carries the same note. */
  let railOut = false;
  /** Matches the transform transition in styles/sidebar.css. Move both together. */
  const RAIL_MS = 340;
  let railTimer: ReturnType<typeof setTimeout> | null = null;

  /** inert takes the subtree out of the tab order and the a11y tree at once,
      which CSS cannot: width:0 and opacity:0 left it all reachable. */
  function setRailInert(on: boolean): void {
    if (sidebarEl) sidebarEl.inert = on;
  }

  /** Awaitable, so opening an entry can wait for the width before aiming at it. */
  function setCollapsed(on: boolean): Promise<void> {
    /* No rail to hide at the dock. Un-collapsing stays allowed: that is how a panel
       collapsed on desktop is recovered after crossing the breakpoint. */
    if (on && isMobile()) return Promise.resolve();
    if (railTimer) {
      clearTimeout(railTimer);
      railTimer = null;
    }
    if (on) {
      closeRail();
      return Promise.resolve();
    }
    return openRail();
  }

  /** Reveals the width first, then slides the panel across it. */
  async function openRail(): Promise<void> {
    if (!collapsed && !railOut) return;
    /* No rail at the dock — the panel is a bottom sheet Sheet drives by inline
       transform, and railOut's translateX would be pulling at the same property.
       Crossing the breakpoint while collapsed lands here, so it has to settle
       rather than animate. */
    if (isMobile()) {
      railOut = false;
      collapsed = false;
      await tick();
      setRailInert(false);
      return;
    }
    /* Both in one flush: the width arrives and the panel is already off to the
       left, so there is no frame where it is seen at rest in the wrong place. */
    railOut = true;
    collapsed = false;
    await tick();
    /* The start state has to be painted before the transition may run from it,
       or the browser coalesces both into no animation at all. */
    if (sidebarEl) {
      sidebarEl.style.transition = 'none';
      void sidebarEl.offsetWidth;
      sidebarEl.style.transition = '';
    }
    setRailInert(false);
    /* The one resize of this toggle, taken now rather than during the slide. */
    stageComp?.absorbResize();
    stageComp?.refresh(true);
    if (REDUCED.matches) {
      railOut = false;
      return;
    }
    requestAnimationFrame(() => {
      railOut = false;
    });
  }

  /** Slides the panel out, and only then takes its width away. */
  function closeRail(): void {
    if (collapsed) return;
    railOut = true;
    setRailInert(true);
    const settle = () => {
      railTimer = null;
      collapsed = true;
      /* The collapsed rule holds it out on its own from here. */
      railOut = false;
      tick().then(() => {
        stageComp?.absorbResize();
        stageComp?.refresh(true);
      });
    };
    if (REDUCED.matches) {
      settle();
      return;
    }
    railTimer = setTimeout(settle, RAIL_MS);
  }

  /* ---------- boot ---------- */
  onMount(async () => {
    injectFonts();
    const params = new URLSearchParams(window.location.search);
    lang = langFromQuery(params) ?? lang;

    applyFilters(filtersFromQuery(params));

    /* Every filter label and option comes from the API, so the panel cannot be
       drawn and no query can run until this resolves. A failure is reported and
       not rethrown: the stage, its chrome and the sheet all still work, and the
       first query fails into the same message. */
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
      /* The handle sets aria-expanded and data-sheet on the node itself. */
      onState: () => {},
    });
    sheet.wire();

    /* Crossing into the docked layout while collapsed has to un-collapse: the media
       block puts the panel back, but `inert` is set on the node and CSS cannot lift it. */
    unlistenBreakpoint = onMobileChange((mobile) => {
      if (mobile) setCollapsed(false);
    });

    mounted = true; // triggers the reactive block above, which runs the first query
  });

  let unlistenBreakpoint: (() => void) | null = null;

  /** Only the dimensions DIM_IDS names are restored; anything else is ignored. */
  function applyFilters(f: Record<string, unknown>): void {
    const next = emptySel();
    for (const [id, values] of Object.entries(pickDimensions(f, DIM_IDS))) {
      values.forEach((v) => next[id].add(v));
    }
    sel = next;
  }

  onDestroy(() => {
    if (railTimer) clearTimeout(railTimer);
    sheet?.destroy();
    unlistenBreakpoint?.();
    stories.cancel();
  });

  /* Escape puts the entry away, scoped to the widget: an embedded map has no
     business answering keys pressed elsewhere on the page. */
  function onRootKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') dismissEntry();
  }
</script>

<!-- Injected rather than compiled, so nothing in it can be pruned for looking
     unused — the place names and pin twins are appended imperatively. `styles`
     is the bundled CSS from lib/styles.ts, a build-time constant with no path
     from any input, which is why the interpolation below is safe. -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html `<style>${styles}</style>`}

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<main
  class="mapc"
  class:collapsed
  class:railout={railOut}
  class:night
  bind:this={mapcEl}
  on:keydown={onRootKey}
>
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
    {statusText}
    {anyFilters}
    {selected}
    {juston}
    onToggleDim={toggleDim}
    onToggleOption={toggleOption}
    onPickType={pickType}
    onReset={reset}
    onCollapse={() => setCollapsed(true)}
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
    {projs}
    {selected}
    {loading}
    {error}
    onSelect={(p) => (p ? openEntry(p) : dismissEntry())}
    onTheme={(n) => (night = n)}
    openerLabel={selected ? t.detailsPane : t.filtersPane}
    onOpen={() => setCollapsed(false)}
    onLang={(l) => (lang = l)}
    lift={() => sheet?.lift() ?? 0}
    sheetEl={sidebarEl}
    {isMobile}
    settledWidth={settledStageWidth}
  />
</main>
