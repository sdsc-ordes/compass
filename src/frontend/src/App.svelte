<svelte:options customElement="compass-map" />

<script lang="ts">
  import { onMount } from 'svelte';
  import Map from './map/Map.svelte';
  import TagPanel from './shared/TagPanel.svelte';
  import ListView from './shared/ListView.svelte';
  import EntitySidebar from './shared/EntitySidebar.svelte';
  import ShareModal from './shared/ShareModal.svelte';
  import { i18n, type Lang } from './shared/i18n';
  import { ownedUrlParams } from './shared/dimensions';
  import {
    getEntities,
    getFacets,
    init as initEngine,
    type EntityProperties,
    type FacetCounts,
    type Feature,
  } from './engine';
  import type { Filters } from './engine/namespaces';
  import {
    Map as MapIcon,
    List,
    Globe,
    Languages,
    ChevronRight,
    ChevronLeft,
    Share2,
  } from 'lucide-svelte';

  /** The API the widget reads its data from. */
  export let apiurl = '';
  export let lang: Lang = 'en';

  let entities: Feature[] = [];
  let activeFilters: Filters = {};
  let legendTypeFilters: string[] = [];
  let viewMode: 'map' | 'list' = 'map';
  let isLoading = true;
  let error: string | null = null;
  let selectedEntity: EntityProperties | null = null;
  let selectedEntityId: string | null = null;
  let facetCounts: FacetCounts = {};
  let filterOpen = true;
  let sidebarVisible = false;
  let mounted = false;
  // The filter panel and the tag chips read the schema synchronously as they
  // render, so nothing depending on it may mount before init() resolves.
  let engineReady = false;

  $: t = i18n[lang] || i18n.en;

  const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

  // Real results = point features; Country/Area regions are always-on background
  // context (see ontology/DECISIONS.md), so they don't count toward the total.
  $: resultCount = entities.filter((e) => !e?.properties?.is_region).length;

  // A thematic (non-legend) filter is active — used to frame matched regions.
  $: thematicFilterActive = Object.entries(activeFilters).some(
    ([k, v]) => k !== 'entityType' && Array.isArray(v) && v.length > 0,
  );

  onMount(async () => {
    // Start with filters collapsed on small screens so the map is visible first.
    if (typeof window !== 'undefined' && window.innerWidth < 900) filterOpen = false;

    try {
      await initEngine(apiurl);
      engineReady = true;
    } catch (e) {
      error = `Cannot reach the API at ${apiurl || '(no apiurl set)'}: ${reason(e)}`;
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.has('lang')) lang = params.get('lang') as Lang;

    const restored: Record<string, string[]> = {};
    for (const [key, val] of params.entries()) {
      if (key === 'lang') continue;
      (restored[key] ??= []).push(val);
    }
    if (Object.keys(restored).length > 0) {
      activeFilters = restored;
      legendTypeFilters = Array.isArray(restored.entityType) ? restored.entityType : [];
    }
    mounted = true; // triggers the reactive block below, which runs the first query
  });

  $: if (mounted) loadData(lang, activeFilters);

  // Discards the results of a query that a newer one has superseded.
  let loadSeq = 0;

  // Facets are a second request; yielding lets the map paint before it runs.
  const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function loadData(l: Lang, f: Filters) {
    const seq = ++loadSeq;
    isLoading = true;
    error = null;
    syncUrl(f, l);
    await nextTick();

    try {
      const data = await getEntities(l, f);
      if (seq !== loadSeq) return;
      entities = data.features;
      isLoading = false;

      // Facets only drive chip counts, so let the map paint before running them.
      await nextTick();
      const counts = await getFacets(l, f);
      if (seq !== loadSeq) return;
      facetCounts = counts;
    } catch (e) {
      if (seq !== loadSeq) return;
      console.error('[Compass] Query failed:', e);
      error = `Failed to load map data: ${reason(e)}`;
    } finally {
      if (seq === loadSeq) isLoading = false;
    }
  }

  /**
   * Mirror the active filters into the address bar; the share button hands out
   * whatever this produces.
   *
   * The widget is embedded in someone else's page, so it rewrites only the
   * parameters it owns -- the filter dimensions and `lang` -- and leaves the
   * host page's own query string intact.
   */
  function syncUrl(f: Filters, l: string) {
    const urlObj = new URL(window.location.href);
    for (const key of ownedUrlParams(l)) urlObj.searchParams.delete(key);
    for (const [key, val] of Object.entries(f)) {
      if (Array.isArray(val)) {
        val.forEach((v) => urlObj.searchParams.append(key, String(v)));
      } else if (val !== undefined && val !== '') {
        urlObj.searchParams.set(key, String(val));
      }
    }
    urlObj.searchParams.set('lang', l);
    window.history.replaceState({}, '', urlObj.toString());
  }

  let shareLink = '';
  let showShareModal = false;

  // Story count state
  let storyCount: { count: number; url: string } | null = null;
  let storyCountLoading = false;
  let storyCountTimer: ReturnType<typeof setTimeout> | null = null;

  // All tag IRIs currently active (excludes entityType and non-IRI values)
  $: storyTagIris = Object.entries(activeFilters)
    .filter(([k]) => k !== 'entityType')
    .flatMap(([, v]) => (Array.isArray(v) ? v : []))
    .filter((v) => typeof v === 'string' && v.startsWith('http'));

  $: {
    if (storyCountTimer) clearTimeout(storyCountTimer);
    if (mounted && apiurl && storyTagIris.length > 0) {
      storyCountLoading = true;
      storyCountTimer = setTimeout(() => fetchStoryCount(apiurl, lang, storyTagIris), 300);
    } else {
      storyCount = null;
      storyCountLoading = false;
    }
  }

  async function fetchStoryCount(url: string, l: string, iris: string[]) {
    try {
      const params = new URLSearchParams({ lang: l });
      iris.forEach((iri) => params.append('tag', iri));
      const resp = await fetch(`${url}/api/stories/count?${params.toString()}`);
      if (resp.ok) {
        storyCount = await resp.json();
      }
    } catch (e) {
      console.error('[Compass] Story count fetch error:', e);
    } finally {
      storyCountLoading = false;
    }
  }

  function saveMapState() {
    shareLink = window.location.href;
    showShareModal = true;
  }

  function handleFilterChange(filters: Record<string, string[]>) {
    // Preserve entityType managed by the map legend (not by TagPanel)
    activeFilters = {
      ...filters,
      ...(legendTypeFilters.length ? { entityType: legendTypeFilters } : {}),
    };
  }

  function handleFilterByRegion(iri: string) {
    // Add the region to the countryArea dimension (preserving other filters)
    // and close the region detail panel — the region is now the active filter.
    const existing = Array.isArray(activeFilters.countryArea) ? activeFilters.countryArea : [];
    const next = existing.includes(iri) ? existing : [...existing, iri];
    activeFilters = { ...activeFilters, countryArea: next };
    sidebarVisible = false;
  }

  function handleTypeFilterChange(iris: string[]) {
    legendTypeFilters = iris;
    const { entityType: _dropped, ...rest } = activeFilters;
    activeFilters = iris.length ? { ...rest, entityType: iris } : rest;
  }

  // Keep the open sidebar in step with a re-fetch (a language change, say).
  // Depends on `entities` and `selectedEntityId` but NOT on `selectedEntity`,
  // which it assigns — that would loop.
  $: if (selectedEntityId && entities.length > 0) {
    const match = entities.find((e) => e.properties?.id === selectedEntityId);
    if (match) selectedEntity = match.properties;
  }

  function handleEntitySelect(props: Record<string, unknown>) {
    const id = typeof props?.id === 'string' ? props.id : null;
    if (!id) return;
    if (selectedEntityId === id && sidebarVisible) {
      // Clicking the already-open entity toggles it closed.
      selectedEntity = null;
      selectedEntityId = null;
      sidebarVisible = false;
    } else {
      selectedEntityId = id;
      selectedEntity = props as EntityProperties;
      sidebarVisible = true;
    }
  }

  function toggleLang() {
    lang = lang === 'en' ? 'de' : 'en';
  }
</script>

<main class="compass-app" {lang}>
  <header class="app-header">
    <div class="brand">
      <div class="logo">
        <Globe size={24} color="#0284c7" />
      </div>
      <h2>OceanCare Compass</h2>
    </div>

    <div class="controls">
      <div class="view-toggle" role="group" aria-label={t.viewSwitcher}>
        <button
          class:active={viewMode === 'map'}
          aria-pressed={viewMode === 'map'}
          on:click={() => (viewMode = 'map')}
        >
          <MapIcon size={16} />
          <span>{t.mapView}</span>
        </button>
        <button
          class:active={viewMode === 'list'}
          aria-pressed={viewMode === 'list'}
          on:click={() => (viewMode = 'list')}
        >
          <List size={16} />
          <span>{t.listView}</span>
        </button>
      </div>

      <button
        type="button"
        class="lang-toggle"
        on:click|preventDefault|stopPropagation={saveMapState}
        title={t.shareTitle}
      >
        <Share2 size={16} />
        <span>{t.share}</span>
      </button>

      <button
        class="lang-toggle"
        on:click={toggleLang}
        aria-label={lang === 'de' ? t.switchToEnglish : t.switchToGerman}
      >
        <Languages size={18} />
        <span>{lang.toUpperCase()}</span>
      </button>
    </div>
  </header>

  <div class="content">
    {#if error && !engineReady}
      <div class="status-overlay error">
        <p>{error}</p>
        <button on:click={() => location.reload()}>Retry</button>
      </div>
    {:else if !engineReady}
      <div class="status-overlay loading">
        <div class="spinner"></div>
        <p>{t.loading}</p>
      </div>
    {:else}
      {#if !filterOpen}
        <button
          class="filter-reopen-tab"
          on:click={() => (filterOpen = true)}
          aria-label={t.openFilters}
        >
          <ChevronRight size={16} />
        </button>
      {/if}
      <div class="sidebar" class:closed={!filterOpen} role="region" aria-label={t.filterRegion}>
        <TagPanel
          {lang}
          initialFilters={activeFilters}
          onTagChange={handleFilterChange}
          onToggle={() => (filterOpen = false)}
          {facetCounts}
          {resultCount}
        />
      </div>
      <div class="main-area" aria-busy={isLoading}>
        <!-- Filtering happens without a page change, so the new result count is
           announced; without this a screen reader user gets silence. -->
        <p class="visually-hidden" role="status" aria-live="polite">
          {isLoading ? t.loading : `${resultCount} ${t.resultsAnnouncement}`}
        </p>
        {#if error}
          <div class="status-overlay error">
            <p>{error}</p>
            <button on:click={() => loadData(lang, activeFilters)}>Retry</button>
          </div>
        {:else if isLoading && entities.length === 0}
          <!-- First load only: nothing on screen yet, so show the full overlay. -->
          <div class="status-overlay loading">
            <div class="spinner"></div>
            <p>{t.loading}</p>
          </div>
        {:else if isLoading}
          <!-- Subsequent filter changes: keep the map visible, show a thin bar. -->
          <div class="loading-bar" aria-label={t.loading}></div>
        {/if}

        {#if selectedEntity && !sidebarVisible}
          <button
            class="sidebar-reopen-tab"
            on:click={() => (sidebarVisible = true)}
            aria-label={t.openDetails}
          >
            <ChevronLeft size={16} />
          </button>
        {/if}

        {#if viewMode === 'map'}
          <Map
            {lang}
            {entities}
            {resultCount}
            tileurl={apiurl}
            frameRegions={thematicFilterActive}
            detailOpen={!!(selectedEntity && sidebarVisible)}
            onEntitySelect={handleEntitySelect}
            activeTypeFilters={legendTypeFilters}
            onTypeFilterChange={handleTypeFilterChange}
            {storyCount}
            {storyCountLoading}
            storyActive={storyTagIris.length > 0}
          />
          <!-- A canvas map carries nothing for a screen reader, so the same
             results are rendered as a table off-screen. Reusing ListView keeps
             the alternative complete by construction. -->
          <div class="visually-hidden">
            <h3>{t.textAlternative}</h3>
            <ListView {entities} {lang} />
          </div>
        {:else}
          <ListView {entities} {lang} />
        {/if}

        {#if selectedEntity && sidebarVisible}
          <EntitySidebar
            entity={selectedEntity}
            {lang}
            regionCount={selectedEntity?.id
              ? facetCounts.countryArea?.[selectedEntity.id]
              : undefined}
            onFilterByRegion={handleFilterByRegion}
            onClose={() => {
              sidebarVisible = false;
            }}
          />
        {/if}
      </div>
    {/if}
  </div>

  {#if showShareModal && shareLink}
    <ShareModal url={shareLink} {lang} onClose={() => (showShareModal = false)} />
  {/if}
</main>

<style>
  /* Off-screen but in the accessibility tree. Not display:none, which would
     hide it from screen readers too, and not width/height 0, which drops the
     text from the a11y tree in some engines. */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  /* A visible focus ring on every interactive element; several controls are
     icon-only, where the browser default is easy to lose. */
  .compass-app :is(button, a, input, select, [tabindex]):focus-visible {
    outline: 2px solid #0284c7;
    outline-offset: 2px;
  }

  :host {
    display: block;
    width: 100%;
    min-height: 700px;
    font-family:
      'Inter',
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      Roboto,
      sans-serif;
    --primary: #0284c7;
    --primary-hover: #0369a1;
  }
  .compass-app {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: #fff;
    box-sizing: border-box;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    overflow: hidden;
  }

  .app-header {
    height: 64px;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    background: white;
    z-index: 20;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .brand h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: #1e293b;
    letter-spacing: -0.025em;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .view-toggle {
    display: flex;
    background: #f1f5f9;
    padding: 4px;
    border-radius: 8px;
    gap: 4px;
  }
  .view-toggle button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 6px 12px;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    color: #64748b;
    cursor: pointer;
    transition: all 0.2s;
  }
  .view-toggle button.active {
    background: white;
    color: var(--primary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .lang-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 6px 12px;
    border: 1px solid #e2e8f0;
    background: white;
    border-radius: 8px;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    color: #475569;
  }

  .view-toggle button:focus-visible,
  .lang-toggle:focus-visible,
  .filter-reopen-tab:focus-visible,
  .sidebar-reopen-tab:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .filter-reopen-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    min-width: 20px;
    border: none;
    border-right: 1px solid #e2e8f0;
    background: #f8fafc;
    color: #64748b;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
    padding: 0;
  }
  .filter-reopen-tab:hover {
    background: #e2e8f0;
    color: #475569;
  }

  .sidebar-reopen-tab {
    position: absolute;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    z-index: 49;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 56px;
    border: 1px solid #e2e8f0;
    border-right: none;
    border-radius: 6px 0 0 6px;
    background: white;
    color: #64748b;
    cursor: pointer;
    box-shadow: -2px 0 8px rgba(0, 0, 0, 0.08);
    transition:
      background 0.15s,
      color 0.15s;
    padding: 0;
  }
  .sidebar-reopen-tab:hover {
    background: #f1f5f9;
    color: var(--primary);
  }

  .content {
    display: flex;
    flex-grow: 1;
    overflow: hidden;
    position: relative;
  }

  .sidebar {
    width: 340px;
    min-width: 340px;
    border-right: 1px solid #e2e8f0;
    background: #f8fafc;
    overflow: hidden;
    transition:
      min-width 0.25s ease,
      width 0.25s ease,
      opacity 0.2s ease,
      border 0.25s ease;
  }
  .sidebar.closed {
    width: 0;
    min-width: 0;
    overflow: hidden;
    opacity: 0;
    border-right: none;
  }
  /* TagPanel renders as the <compass-tags-inner> custom element, which defaults
     to inline/auto height. Force it to fill the sidebar so its internal
     overflow-y:auto scrolls instead of overflowing and being clipped. */
  .sidebar :global(compass-tags-inner) {
    display: block;
    height: 100%;
    min-height: 0;
  }

  .main-area {
    flex-grow: 1;
    background: #fff;
    position: relative;
    overflow: hidden;
  }

  .status-overlay {
    position: absolute;
    inset: 0;
    z-index: 100;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    font-weight: 500;
  }

  .status-overlay.error {
    color: #ef4444;
    background: #fef2f2;
  }

  .status-overlay button {
    background: var(--primary);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #e2e8f0;
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    z-index: 100;
    overflow: hidden;
    background: rgba(2, 132, 199, 0.15);
  }
  .loading-bar::before {
    content: '';
    position: absolute;
    inset: 0;
    width: 40%;
    background: var(--primary);
    animation: indeterminate 1.1s ease-in-out infinite;
  }
  @keyframes indeterminate {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(350%);
    }
  }

  /* On small screens the filter panel becomes an overlay drawer (collapsed by
     default, see onMount) so the map is the first thing visible. */
  @media (max-width: 900px) {
    .sidebar {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 30;
      width: 86%;
      max-width: 340px;
      min-width: 0;
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.18);
    }
    .main-area {
      height: 100%;
    }
  }
</style>
