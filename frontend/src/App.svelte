<svelte:options customElement="compass-map" />

<script lang="ts">
  import { onMount } from 'svelte';
  import Map from './map/Map.svelte';
  import TagPanel from './shared/TagPanel.svelte';
  import ListView from './shared/ListView.svelte';
  import EntitySidebar from './shared/EntitySidebar.svelte';
  import ShareModal from './shared/ShareModal.svelte';
  import { i18n, type Lang } from './shared/i18n';
  import { Map as MapIcon, List, Globe, Languages, ChevronRight, ChevronLeft, Share2 } from 'lucide-svelte';

  export let apiurl = '';
  export let lang: Lang = 'en';

  let entities: any[] = [];
  let activeFilters: any = {};
  let legendTypeFilters: string[] = [];
  let viewMode: 'map' | 'list' = 'map';
  let isLoading = true;
  let error: string | null = null;
  let selectedEntity: any = null;
  let selectedEntityId: string | null = null;
  let facetCounts: Record<string, Record<string, number>> = {};
  let filterOpen = true;
  let sidebarVisible = false;
  let mounted = false;

  $: t = i18n[lang] || i18n.en;

  // Real results = point features; Country/Area regions are always-on background
  // context (see ontology/DECISIONS.md), so they don't count toward the total.
  $: resultCount = entities.filter((e: any) => !e?.properties?.is_region).length;

  // A thematic (non-legend) filter is active — used to frame matched regions.
  $: thematicFilterActive = Object.entries(activeFilters).some(
    ([k, v]) => k !== 'entityType' && Array.isArray(v) && v.length > 0
  );

  // Sync with URL on mount
  onMount(async () => {
    console.log("[Compass] Component mounted. Initial apiurl:", apiurl);
    // Start with filters collapsed on small screens so the map is visible first.
    if (typeof window !== 'undefined' && window.innerWidth < 900) filterOpen = false;
    const params = new URLSearchParams(window.location.search);
    if (params.has('lang')) lang = params.get('lang') as Lang;
    
    // Restore saved state if 'state' param exists
    if (params.has('state')) {
      const stateId = params.get('state');
      console.log("[Compass] Restoring state:", stateId);
      if (apiurl && stateId) {
        try {
          const resp = await fetch(`${apiurl}/api/states/${stateId}`);
          const data = await resp.json();
          activeFilters = data.filters || {};
          legendTypeFilters = Array.isArray(activeFilters.entityType) ? activeFilters.entityType : [];
          viewMode = data.view || 'map';
          if (data.lang) lang = data.lang;
        } catch (e) {
          console.error('[Compass] Failed to restore state:', e);
        }
      }
    } else {
       // Restore filter params from URL (all params except lang)
       const restoredFilters: Record<string, string[]> = {};
       for (const [key, val] of params.entries()) {
         if (key === 'lang') continue;
         if (!restoredFilters[key]) restoredFilters[key] = [];
         restoredFilters[key].push(val);
       }
       if (Object.keys(restoredFilters).length > 0) {
         activeFilters = restoredFilters;
         legendTypeFilters = Array.isArray(activeFilters.entityType) ? activeFilters.entityType : [];
         console.log("[Compass] Restored filters from URL:", activeFilters);
       }
       console.log("[Compass] No saved state. Running initial fetch...");
       if (apiurl) {
         fetchEntities(apiurl, lang, activeFilters);
       } else {
         console.warn("[Compass] No apiurl on mount. Waiting for attribute...");
       }
    }
    mounted = true;
  });

  $: {
    console.log("[Compass] Reactive check - apiurl:", apiurl, "lang:", lang);
    if (mounted && apiurl) {
      fetchEntities(apiurl, lang, activeFilters);
      fetchFacets(apiurl, lang, activeFilters);
    }
  }

  // Build the API query string shared by /entities and /entities/facets.
  function buildEntityParams(f: any, l: string): URLSearchParams {
    const params = new URLSearchParams({ lang: l });
    for (const [key, val] of Object.entries(f)) {
      if (Array.isArray(val)) {
        val.forEach((v) => params.append(key, String(v)));
      } else if (val !== undefined && val !== '') {
        params.append(key, String(val));
      }
    }
    return params;
  }

  async function fetchFacets(url: string, l: string, f: any) {
    if (!url) return;
    try {
      const resp = await fetch(`${url}/api/entities/facets?${buildEntityParams(f, l).toString()}`);
      if (resp.ok) facetCounts = await resp.json();
    } catch (e) {
      console.error('[Compass] Facet fetch error:', e);
    }
  }

  async function fetchEntities(url: string, l: string, f: any) {
    if (!url) return;
    isLoading = true;
    error = null;
    
    // Construct query string for API
    const params = new URLSearchParams({ lang: l });
    for (const [key, val] of Object.entries(f)) {
      if (Array.isArray(val)) {
        val.forEach(v => params.append(key, v));
      } else {
        params.append(key, String(val));
      }
    }

    const API_FETCH_TIMEOUT_MS = 8_000;

  // Update Browser URL without page reload (stateless sync)
    const urlObj = new URL(window.location.origin + window.location.pathname);
    for (const [key, val] of Object.entries(f)) {
      if (Array.isArray(val)) {
        val.forEach(v => urlObj.searchParams.append(key, v));
      } else if (val !== undefined && val !== '') {
        urlObj.searchParams.set(key, String(val));
      }
    }
    urlObj.searchParams.set('lang', l);
    window.history.replaceState({}, '', urlObj.toString());

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);
    const fullUrl = `${url}/api/entities/?${params.toString()}`;
    console.log('[Compass] Fetching:', fullUrl);

    try {
      const resp = await fetch(fullUrl, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      console.log('[Compass] Response status:', resp.status);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      entities = data.features || [];
      console.log('[Compass] Loaded entities:', entities.length);
    } catch (e: any) {
      console.error('[Compass] Fetch Error:', e);
      if (e?.name === 'AbortError') {
        error = "Connection timed out. Is the backend running at " + url + "?";
      } else {
        error = "Failed to connect to backend: " + (e?.message ?? e);
      }
    } finally {
      isLoading = false;
    }
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

  function handleFilterChange(filters: any) {
    // Preserve entityType managed by the map legend (not by FilterPanel)
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
    activeFilters = {
      ...activeFilters,
      ...(iris.length ? { entityType: iris } : {}),
    };
    if (!iris.length) {
      const { entityType: _, ...rest } = activeFilters;
      activeFilters = rest;
    }
  }

  // When entities are re-fetched (e.g. language change), refresh the open sidebar.
  // Depends only on `entities` and `selectedEntityId` — NOT on `selectedEntity` — to avoid infinite loops.
  // Nested objects are re-serialized to JSON strings so EntitySidebar's JSON.parse calls work correctly.
  $: if (selectedEntityId && entities.length > 0) {
    const match = entities.find((e: any) => e.properties?.id === selectedEntityId);
    if (match) {
      const p = match.properties;
      // MapLibre flattens GeoJSON feature properties to strings when rendering,
      // so nested objects (arrays, objects) must be re-serialised here and
      // parsed back in EntitySidebar via safeParseJson.
      const serialized: Record<string, any> = {};
      for (const [key, val] of Object.entries(p)) {
        // Only stringify arrays of objects (tag dimensions like {iri, label}).
        // Leave scalar values and simple strings untouched.
        const isTagArray = Array.isArray(val) && val.length > 0 && typeof val[0] === 'object';
        serialized[key] = isTagArray ? JSON.stringify(val) : val;
      }
      selectedEntity = serialized;
    }
  }

  function handleEntitySelect(props: any) {
    const id = props?.id ?? null;
    if (!id) return;
    if (selectedEntityId === id && sidebarVisible) {
      // Clicking the already-open entity toggles it closed.
      selectedEntity = null;
      selectedEntityId = null;
      sidebarVisible = false;
    } else {
      selectedEntityId = id;
      sidebarVisible = true;
    }
  }

  function toggleLang() {
    lang = lang === 'en' ? 'de' : 'en';
  }
</script>

<main class="compass-app">
  <header class="app-header">
    <div class="brand">
      <div class="logo">
         <Globe size={24} color="#0284c7" />
      </div>
      <h2>OceanCare Compass</h2>
    </div>
    
    <div class="controls">
      <div class="view-toggle">
        <button class:active={viewMode === 'map'} aria-pressed={viewMode === 'map'} on:click={() => viewMode = 'map'}>
          <MapIcon size={16} />
          <span>{t.mapView}</span>
        </button>
        <button class:active={viewMode === 'list'} aria-pressed={viewMode === 'list'} on:click={() => viewMode = 'list'}>
          <List size={16} />
          <span>{t.listView}</span>
        </button>
      </div>

      <button type="button" class="lang-toggle" on:click|preventDefault|stopPropagation={saveMapState} title={t.shareTitle}>
        <Share2 size={16} />
        <span>{t.share}</span>
      </button>

      <button class="lang-toggle" on:click={toggleLang}>
        <Languages size={18} />
        <span>{lang.toUpperCase()}</span>
      </button>

    </div>
  </header>

  <div class="content">
    {#if !filterOpen}
      <button class="filter-reopen-tab" on:click={() => (filterOpen = true)} title="Show filters" aria-label="Open filter panel">
        <ChevronRight size={16} />
      </button>
    {/if}
    <div class="sidebar" class:closed={!filterOpen}>
      <TagPanel
        {apiurl}
        {lang}
        initialFilters={activeFilters}
        onTagChange={handleFilterChange}
        onToggle={() => (filterOpen = false)}
        {facetCounts}
        {resultCount}
      />
    </div>
    <div class="main-area">
      {#if error}
        <div class="status-overlay error">
          <p>{error}</p>
          <div class="url-hint">{apiurl}/api/entities</div>
          <button on:click={() => fetchEntities(apiurl, lang, activeFilters)}>Retry</button>
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
        <button class="sidebar-reopen-tab" on:click={() => (sidebarVisible = true)} title="Show detail panel" aria-label="Open detail panel">
          <ChevronLeft size={16} />
        </button>
      {/if}

      {#if viewMode === 'map'}
        <Map {apiurl} {lang} {entities} {resultCount} frameRegions={thematicFilterActive} detailOpen={!!(selectedEntity && sidebarVisible)} onEntitySelect={handleEntitySelect} activeTypeFilters={legendTypeFilters} onTypeFilterChange={handleTypeFilterChange} {storyCount} {storyCountLoading} storyActive={storyTagIris.length > 0} />
      {:else}
        <ListView {entities} {lang} />
      {/if}

      {#if selectedEntity && sidebarVisible}
        <EntitySidebar
          entity={selectedEntity}
          {lang}
          regionCount={selectedEntity?.id ? facetCounts.countryArea?.[selectedEntity.id] : undefined}
          onFilterByRegion={handleFilterByRegion}
          onClose={() => { sidebarVisible = false; }}
        />
      {/if}
    </div>
  </div>

  {#if showShareModal && shareLink}
    <ShareModal url={shareLink} {lang} onClose={() => (showShareModal = false)} />
  {/if}
</main>

<style>
  :host {
    display: block;
    width: 100%;
    min-height: 700px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
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
    color: #94a3b8;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
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
    box-shadow: -2px 0 8px rgba(0,0,0,0.08);
    transition: background 0.15s, color 0.15s;
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
    transition: min-width 0.25s ease, width 0.25s ease, opacity 0.2s ease, border 0.25s ease;
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

  .url-hint {
    font-family: monospace;
    font-size: 12px;
    color: #64748b;
    margin-bottom: 8px;
    word-break: break-all;
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
    to { transform: rotate(360deg); }
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
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }

  .placeholder-list {
    padding: 2rem;
    height: 100%;
    overflow-y: auto;
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
