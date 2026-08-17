<svelte:options customElement="compass-tags-inner" />

<script lang="ts">
  import { Tags, X, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-svelte';
  import { i18n, type Lang } from './i18n';

  export let apiurl = '';
  export let lang: Lang = 'en';
  export let onTagChange: (filters: Record<string, string[]>) => void;
  export let onToggle: (() => void) | undefined = undefined;
  export let initialFilters: Record<string, any> = {};
  export let facetCounts: Record<string, Record<string, number>> = {};
  export let resultCount: number | undefined = undefined;

  // Sections with more options than this get an inline search box.
  const SEARCH_THRESHOLD = 8;

  let schema: any[] = [];
  let selectedTags: Record<string, string[]> = {};
  let collapsedSections: Record<string, boolean> = {};
  let sectionSearch: Record<string, string> = {};

  $: t = i18n[lang] || i18n.en;
  $: fetchSchema(apiurl, lang);

  // Only show SKOS taxonomy dimensions; entityType is handled by the legend,
  // relatedProject and forum are entity relationships not thematic tags.
  const EXCLUDED_DIMENSIONS = new Set(['entityType', 'relatedProject', 'forum']);
  $: tagSchema = schema.filter((f: any) => f.type === 'multiselect' && !EXCLUDED_DIMENSIONS.has(f.id));

  // Sync selection from externally-set filters (URL restore, region CTA, etc.).
  // Runs whenever initialFilters changes; the round-trip through onTagChange →
  // App.activeFilters → initialFilters reproduces the same value, so a local
  // toggle settles without clobbering. Guarded by a value comparison to avoid loops.
  $: syncFromExternal(initialFilters, tagSchema);

  function syncFromExternal(filters: Record<string, any>, schema: any[]) {
    if (schema.length === 0) return;
    const next: Record<string, string[]> = {};
    for (const f of schema) {
      if (Array.isArray(filters[f.id]) && filters[f.id].length > 0) {
        next[f.id] = filters[f.id];
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(selectedTags)) {
      selectedTags = next;
    }
  }

  // Initialise all sections as open on first schema load
  $: if (tagSchema.length > 0 && Object.keys(collapsedSections).length === 0) {
    collapsedSections = Object.fromEntries(tagSchema.map((f) => [f.id, false]));
  }

  async function fetchSchema(url: string, l: string) {
    if (!url) return;
    try {
      const resp = await fetch(`${url}/api/filters/schema?lang=${l}`);
      schema = await resp.json();
    } catch (e) {
      console.error('TagPanel: failed to fetch schema:', e);
    }
  }

  function toggleTag(dimensionId: string, value: string) {
    const current = selectedTags[dimensionId] ?? [];
    const idx = current.indexOf(value);
    let next: string[];
    if (idx > -1) {
      next = current.filter((v) => v !== value);
    } else {
      next = [...current, value];
    }
    if (next.length === 0) {
      const { [dimensionId]: _, ...rest } = selectedTags;
      selectedTags = rest;
    } else {
      selectedTags = { ...selectedTags, [dimensionId]: next };
    }
    onTagChange(selectedTags);
  }

  function clearAll() {
    selectedTags = {};
    onTagChange(selectedTags);
  }

  function toggleSection(id: string) {
    collapsedSections = { ...collapsedSections, [id]: !collapsedSections[id] };
  }

  // Options filtered by the section's search term (case-insensitive substring).
  // The term is passed in (not read from sectionSearch here) so Svelte tracks it
  // as a dependency of the {#each} and re-renders as you type.
  function visibleOptions(filter: any, search: string): any[] {
    const term = (search ?? '').trim().toLowerCase();
    if (!term) return filter.options;
    return filter.options.filter((o: any) => o.label.toLowerCase().includes(term));
  }

  $: hasActiveTags = Object.values(selectedTags).some((v) => v.length > 0);

  // Flat list of selected {dimensionId, value, label} for the top chips row
  $: selectedChips = tagSchema.flatMap((f) =>
    (selectedTags[f.id] ?? []).map((iri) => ({
      dimensionId: f.id,
      value: iri,
      label: f.options.find((o: any) => o.value === iri)?.label ?? iri,
    }))
  );
</script>

<div class="tag-panel">
  <!-- Header -->
  <div class="header">
    <Tags size={18} color="#64748b" />
    <h3>{t.exploreTags}</h3>
    {#if hasActiveTags}
      <button class="reset-btn" on:click={clearAll}>{t.resetFilters}</button>
    {/if}
    {#if onToggle}
      <button class="collapse-btn" on:click={onToggle} title="Hide panel" aria-label="Collapse tag panel">
        <ChevronLeft size={16} />
      </button>
    {/if}
  </div>

  <!-- Active tag chips -->
  {#if hasActiveTags}
    <div class="active-chips">
      {#each selectedChips as chip}
        <button class="chip chip-active" on:click={() => toggleTag(chip.dimensionId, chip.value)}>
          <span>{chip.label}</span>
          <X size={11} strokeWidth={2.5} />
        </button>
      {/each}
    </div>
  {/if}

  <!-- Result count / empty state -->
  {#if resultCount !== undefined}
    {#if resultCount === 0}
      <div class="results-empty">
        <p>{t.noResults}</p>
        {#if hasActiveTags}
          <button class="results-reset" on:click={clearAll}>{t.clearToSeeAll}</button>
        {/if}
      </div>
    {:else}
      <div class="results-line">{resultCount} {t.resultsCount}</div>
    {/if}
  {/if}

  <!-- Tag dimension sections (only this region scrolls) -->
  <div class="sections-scroll">
    <div class="sections">
    {#each tagSchema as filter}
      <div class="section">
        <button class="section-header" on:click={() => toggleSection(filter.id)}>
          <span class="section-label">{filter.label}</span>
          {#if selectedTags[filter.id]?.length}
            <span class="section-count">{selectedTags[filter.id].length}</span>
          {/if}
          <span class="section-chevron">
            {#if collapsedSections[filter.id]}
              <ChevronRight size={13} color="#94a3b8" />
            {:else}
              <ChevronDown size={13} color="#94a3b8" />
            {/if}
          </span>
        </button>

        {#if !collapsedSections[filter.id]}
          {#if filter.options.length > SEARCH_THRESHOLD}
            <input
              class="section-search"
              type="text"
              placeholder={t.searchPlaceholder}
              aria-label={`${t.searchPlaceholder} ${filter.label}`}
              bind:value={sectionSearch[filter.id]}
            />
          {/if}
          <div class="chips">
            {#each visibleOptions(filter, sectionSearch[filter.id]) as opt}
              {@const selected = selectedTags[filter.id]?.includes(opt.value)}
              {@const dimCounts = facetCounts[filter.id]}
              {@const count = dimCounts?.[opt.value] ?? 0}
              {@const disabled = dimCounts !== undefined && count === 0 && !selected}
              <button
                class="chip"
                class:chip-active={selected}
                class:chip-disabled={disabled}
                aria-pressed={selected}
                aria-disabled={disabled}
                on:click={() => { if (!disabled) toggleTag(filter.id, opt.value); }}
              >
                <span>{opt.label}</span>
                {#if count > 0}<span class="chip-count">{count}</span>{/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
    </div>
  </div>
</div>

<style>
  .tag-panel {
    background: transparent;
    padding: 1.5rem;
    height: 100%;
    box-sizing: border-box;
    overflow: hidden;
    font-family: inherit;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    color: #475569;
    padding-bottom: 0.25rem;
    flex-shrink: 0;
  }
  .header h3 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex: 1;
  }
  .reset-btn {
    background: none;
    border: 1px solid #cbd5e1;
    border-radius: 5px;
    color: #64748b;
    cursor: pointer;
    font-size: 0.75rem;
    padding: 2px 8px;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .reset-btn:hover {
    background: #f1f5f9;
    border-color: #94a3b8;
    color: #0f172a;
  }
  .collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    background: none;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    color: #94a3b8;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .collapse-btn:hover {
    background: #e2e8f0;
    color: #475569;
  }

  /* Active chip strip */
  .active-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
  }

  /* Result count / empty state */
  .results-line {
    font-size: 0.75rem;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }
  .results-empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.75rem;
    background: #fff7ed;
    border: 1px solid #fed7aa;
    border-radius: 10px;
    flex-shrink: 0;
  }
  .results-empty p {
    margin: 0;
    font-size: 0.8125rem;
    color: #9a3412;
    font-weight: 500;
  }
  .results-reset {
    background: none;
    border: none;
    padding: 0;
    color: #c2410c;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
  }
  .results-reset:hover {
    color: #9a3412;
  }

  /* Only the sections region scrolls; the header/chips/results stay pinned
     above. min-height:0 lets it shrink within the flex column so overflow works. */
  .sections-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    /* negative margin + matching padding so the scrollbar sits at the panel
       edge rather than inset by the panel's padding. */
    margin: 0 -1.5rem;
    padding: 0 1.5rem;
  }
  /* Dimension sections */
  .sections {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .section-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 0;
    width: 100%;
    text-align: left;
  }
  .section-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: #64748b;
    flex: 1;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .section-header:hover .section-label {
    color: #0f172a;
  }
  .section-count {
    background: #0284c7;
    color: white;
    font-size: 0.6875rem;
    font-weight: 700;
    border-radius: 10px;
    padding: 1px 6px;
    line-height: 1.4;
  }
  .section-chevron {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  /* Chips */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    padding: 0 0 0.25rem 0;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 4px 11px;
    border-radius: 20px;
    border: 1px solid #e2e8f0;
    background: white;
    color: #475569;
    cursor: pointer;
    font-size: 0.8125rem;
    font-family: inherit;
    white-space: nowrap;
    transition: all 0.15s;
    line-height: 1.4;
  }
  .chip:hover {
    background: #f1f5f9;
    border-color: #94a3b8;
    color: #0f172a;
  }
  .chip:focus-visible,
  .section-header:focus-visible {
    outline: 2px solid #0284c7;
    outline-offset: 2px;
  }
  .chip-active {
    background: #0284c7;
    border-color: #0284c7;
    color: white;
    font-weight: 500;
  }
  .chip-active:hover {
    background: #0369a1;
    border-color: #0369a1;
    color: white;
  }
  .chip-count {
    font-size: 0.6875rem;
    font-weight: 600;
    color: #94a3b8;
    background: #f1f5f9;
    border-radius: 8px;
    padding: 0 5px;
    line-height: 1.5;
  }
  .chip-active .chip-count {
    color: #fff;
    background: rgba(255, 255, 255, 0.25);
  }
  .chip-disabled {
    opacity: 0.4;
    cursor: default;
  }
  .chip-disabled:hover {
    background: white;
    border-color: #e2e8f0;
    color: #475569;
  }

  .section-search {
    width: 100%;
    box-sizing: border-box;
    padding: 5px 10px;
    margin-bottom: 0.375rem;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.8125rem;
    font-family: inherit;
    color: #475569;
    background: white;
  }
  .section-search:focus {
    outline: none;
    border-color: #0284c7;
    box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
  }

</style>
