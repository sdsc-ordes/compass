<svelte:options customElement="compass-map" />

<script lang="ts">
  import { onMount } from 'svelte';
  import Map from './map/Map.svelte';
  import FilterPanel from './filters/FilterPanel.svelte';
  import ListView from './shared/ListView.svelte';
  import { i18n, type Lang } from './shared/i18n';
  import { Map as MapIcon, List, Globe, Languages } from 'lucide-svelte';

  export let apiurl = '';
  export let lang: Lang = 'en';

  let entities: any[] = [];
  let activeFilters: any = {};
  let viewMode: 'map' | 'list' = 'map';
  let isLoading = true;
  let error: string | null = null;

  $: t = i18n[lang] || i18n.en;

  // Sync with URL on mount
  onMount(async () => {
    console.log("[Compass] Component mounted. Initial apiurl:", apiurl);
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
          viewMode = data.view || 'map';
          if (data.lang) lang = data.lang;
        } catch (e) {
          console.error('[Compass] Failed to restore state:', e);
        }
      }
    } else {
       console.log("[Compass] No saved state. Running initial fetch...");
       if (apiurl) {
         fetchEntities(apiurl, lang, activeFilters);
       } else {
         console.warn("[Compass] No apiurl on mount. Waiting for attribute...");
       }
    }
  });

  $: {
    console.log("[Compass] Reactive check - apiurl:", apiurl, "lang:", lang);
    if (apiurl) {
      fetchEntities(apiurl, lang, activeFilters);
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

    // Update Browser URL without page reload (stateless sync)
    const urlObj = new URL(window.location.href);
    for (const [key, val] of Object.entries(f)) {
       urlObj.searchParams.set(key, String(val));
    }
    urlObj.searchParams.set('lang', l);
    window.history.replaceState({}, '', urlObj.toString());

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
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
    } catch (e) {
      console.error('[Compass] Fetch Error:', e);
      if (e.name === 'AbortError') {
        error = "Connection timed out. Is the backend running at " + url + "?";
      } else {
        error = "Failed to connect to backend: " + e.message;
      }
    } finally {
      isLoading = false;
    }
  }

  let shareLink = '';

  async function saveMapState() {
    if (!apiurl) return;
    const body = {
      filters: activeFilters,
      view: viewMode,
      lang: lang
    };

    try {
      const resp = await fetch(`${apiurl}/api/states/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      shareLink = `${window.location.origin}${window.location.pathname}?state=${data.id}`;
      alert(`State saved! Your shareable link: ${shareLink}`);
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }

  function handleFilterChange(filters: any) {
    activeFilters = { ...filters };
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
        <button class:active={viewMode === 'map'} on:click={() => viewMode = 'map'}>
          <MapIcon size={16} />
          <span>{t.mapView}</span>
        </button>
        <button class:active={viewMode === 'list'} on:click={() => viewMode = 'list'}>
          <List size={16} />
          <span>{t.listView}</span>
        </button>
      </div>
      
      <button class="lang-toggle" on:click={saveMapState} title="Save current map state">
        <div style="display:flex; align-items:center; gap:0.5rem">
           <svg xmlns="http://www.w3.org/2000/01/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-share-2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
           <span>Share</span>
        </div>
      </button>

      <button class="lang-toggle" on:click={toggleLang}>
        <Languages size={18} />
        <span>{lang.toUpperCase()}</span>
      </button>
    </div>
  </header>

  <div class="content">
    <div class="sidebar">
      <FilterPanel 
        {apiurl} 
        {lang} 
        onFilterChange={handleFilterChange} 
      />
    </div>
    <div class="main-area">
      <!-- DEBUG OVERLAY: Helpful to see if URL is being picked up -->
      <div class="debug-overlay">
        <span>URL: {apiurl || 'NOT SET'}</span> | 
        <span>Status: {error ? 'ERROR' : (isLoading ? 'LOADING' : 'READY')}</span> |
        <span>Entities: {entities.length}</span>
      </div>

      {#if error}
        <div class="status-overlay error">
          <p>{error}</p>
          <div class="url-hint">{apiurl}/api/entities</div>
          <button on:click={() => fetchEntities(apiurl, lang, activeFilters)}>Retry</button>
        </div>
      {:else if isLoading}
        <div class="status-overlay loading">
           <div class="spinner"></div>
           <p>{t.loading}</p>
        </div>
      {/if}

      {#if viewMode === 'map'}
        <Map {apiurl} {lang} {entities} />
      {:else}
        <ListView {entities} {lang} />
      {/if}
    </div>
  </div>
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

  .content {
    display: flex;
    flex-grow: 1;
    overflow: hidden;
  }

  .sidebar {
    width: 340px;
    border-right: 1px solid #e2e8f0;
    background: #f8fafc;
    overflow-y: auto;
  }

  .main-area {
    flex-grow: 1;
    background: #fff;
    position: relative;
    overflow: hidden;
  }

  .debug-overlay {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 101;
    background: rgba(15, 23, 42, 0.9);
    color: #34d399; /* neon green */
    padding: 6px 12px;
    border-radius: 6px;
    font-family: monospace;
    font-size: 11px;
    pointer-events: none;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
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

  .placeholder-list {
    padding: 2rem;
    height: 100%;
    overflow-y: auto;
  }

  @media (max-width: 900px) {
    .content {
      flex-direction: column;
      overflow-y: auto;
    }
    .sidebar {
      width: 100%;
      height: auto;
      border-right: none;
      border-bottom: 1px solid #e2e8f0;
    }
    .main-area {
      height: 500px;
      flex-shrink: 0;
    }
  }
</style>
