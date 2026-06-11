<svelte:options customElement="compass-tags-inner" />

<script lang="ts">
  import { onMount } from 'svelte';
  import { Tags, X, ChevronDown, ChevronRight, ChevronLeft, BookOpen } from 'lucide-svelte';
  import { i18n, type Lang } from './i18n';

  export let apiurl = '';
  export let lang: Lang = 'en';
  export let onTagChange: (filters: Record<string, string[]>) => void;
  export let onToggle: (() => void) | undefined = undefined;
  export let initialFilters: Record<string, any> = {};
  export let storyCount: { count: number; url: string } | null = null;
  export let storyCountLoading = false;

  let schema: any[] = [];
  let selectedTags: Record<string, string[]> = {};
  let initialApplied = false;
  let collapsedSections: Record<string, boolean> = {};

  $: t = i18n[lang] || i18n.en;
  $: fetchSchema(apiurl, lang);

  // Only show SKOS taxonomy dimensions; entityType is handled by the legend,
  // relatedProject and forum are entity relationships not thematic tags.
  const EXCLUDED_DIMENSIONS = new Set(['entityType', 'relatedProject', 'forum']);
  $: tagSchema = schema.filter((f: any) => f.type === 'multiselect' && !EXCLUDED_DIMENSIONS.has(f.id));

  // Apply initial filters once schema is loaded
  $: if (tagSchema.length > 0 && !initialApplied && Object.keys(initialFilters).length > 0) {
    const applied: Record<string, string[]> = {};
    for (const f of tagSchema) {
      if (Array.isArray(initialFilters[f.id]) && initialFilters[f.id].length > 0) {
        applied[f.id] = initialFilters[f.id];
      }
    }
    if (Object.keys(applied).length > 0) {
      selectedTags = applied;
    }
    initialApplied = true;
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

  <!-- Tag dimension sections -->
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
          <div class="chips">
            {#each filter.options as opt}
              <button
                class="chip"
                class:chip-active={selectedTags[filter.id]?.includes(opt.value)}
                on:click={() => toggleTag(filter.id, opt.value)}
              >
                {opt.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Story count widget (only shown when ≥1 tag selected) -->
  {#if hasActiveTags}
    <div class="story-widget">
      {#if storyCountLoading}
        <div class="story-loading">
          <span class="mini-spinner"></span>
          <span class="story-label">...</span>
        </div>
      {:else if storyCount !== null && storyCount.count > 0}
        <a href={storyCount.url} target="_blank" rel="noopener noreferrer" class="story-link">
          <BookOpen size={15} />
          <span>
            <strong>{storyCount.count}</strong>
            {t.storiesCount}
          </span>
          <span class="story-arrow">→</span>
        </a>
      {:else if storyCount !== null && storyCount.count === 0}
        <p class="story-none">{t.storiesNone}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tag-panel {
    background: transparent;
    padding: 1.5rem;
    height: 100%;
    overflow-y: auto;
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

  /* Dimension sections */
  .sections {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1;
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

  /* Story widget */
  .story-widget {
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid #e2e8f0;
    flex-shrink: 0;
  }
  .story-loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #94a3b8;
    font-size: 0.875rem;
    padding: 8px 0;
  }
  .mini-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid #e2e8f0;
    border-top-color: #0284c7;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .story-link {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 10px 14px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 10px;
    color: #1d4ed8;
    text-decoration: none;
    font-size: 0.875rem;
    transition: background 0.15s, border-color 0.15s;
    line-height: 1.4;
  }
  .story-link:hover {
    background: #dbeafe;
    border-color: #93c5fd;
  }
  .story-link span {
    flex: 1;
  }
  .story-link strong {
    font-weight: 700;
  }
  .story-arrow {
    font-size: 1rem;
    font-weight: 700;
    flex-shrink: 0;
  }
  .story-none {
    margin: 0;
    font-size: 0.8125rem;
    color: #94a3b8;
    padding: 8px 0;
  }
</style>
