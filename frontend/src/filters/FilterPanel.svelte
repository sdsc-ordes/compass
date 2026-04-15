<svelte:options customElement="compass-filters-inner" />

<script lang="ts">
  import { onMount } from 'svelte';
  import { Filter, Check, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-svelte';
  import { i18n, type Lang } from '../shared/i18n';

  export let apiurl = '';
  export let lang: Lang = 'en';
  export let onFilterChange: (filters: any) => void;
  export let onToggle: (() => void) | undefined = undefined;
  export let initialFilters: Record<string, any> = {};

  let schema: any[] = [];
  let activeFilters: Record<string, any> = {};
  let initialApplied = false;

  $: t = i18n[lang] || i18n.en;
  $: fetchSchema(apiurl, lang);

  // Apply initial filters once schema is loaded
  $: if (schema.length > 0 && !initialApplied && Object.keys(initialFilters).length > 0) {
    activeFilters = { ...initialFilters };
    initialApplied = true;
  }

  async function fetchSchema(url: string, l: string) {
    if (!url) return;
    try {
      const resp = await fetch(`${url}/api/filters/schema?lang=${l}`);
      schema = await resp.json();
    } catch (e) {
      console.error('Failed to fetch filter schema:', e);
    }
  }

  function toggleOption(filterId: string, value: string) {
    if (!activeFilters[filterId]) {
      activeFilters[filterId] = [];
    }
    const idx = activeFilters[filterId].indexOf(value);
    if (idx > -1) {
      activeFilters[filterId] = activeFilters[filterId].filter((v: string) => v !== value);
    } else {
      activeFilters[filterId] = [...activeFilters[filterId], value];
    }
    notify();
  }

  function handleSlider(filterId: string, event: Event) {
    const val = (event.target as HTMLInputElement).value;
    activeFilters[filterId] = val;
    notify();
  }

  function handleDatePicker(filterId: string, event: Event) {
    const val = (event.target as HTMLInputElement).value;
    activeFilters[filterId] = val || undefined;
    notify();
  }

  function notify() {
    onFilterChange(activeFilters);
  }

  function resetFilters() {
    activeFilters = {};
    notify();
  }

  let collapsedFilters: Record<string, boolean> = {};

  $: if (schema.length > 0 && Object.keys(collapsedFilters).length === 0) {
    collapsedFilters = Object.fromEntries(schema.map(f => [f.id, true]));
  }

  function toggleCollapse(filterId: string) {
    collapsedFilters[filterId] = !collapsedFilters[filterId];
  }

  $: hasActiveFilters = Object.values(activeFilters).some(
    (v) => (Array.isArray(v) ? v.length > 0 : v !== '' && v !== undefined)
  );
</script>

<div class="filter-panel">
  <div class="header">
    <Filter size={18} color="#64748b" />
    <h3>{t.filters}</h3>
    {#if hasActiveFilters}
      <button class="reset-btn" on:click={resetFilters}>{t.resetFilters}</button>
    {/if}
    {#if onToggle}
      <button class="collapse-btn" on:click={onToggle} title="Hide filters" aria-label="Collapse filter panel">
        <ChevronLeft size={16} />
      </button>
    {/if}
  </div>

  <div class="filters-list">
    {#each schema as filter}
      <div class="filter-group">
        <button class="filter-group-header" on:click={() => toggleCollapse(filter.id)}>
          <span class="filter-label">{filter.label}</span>
          <span class="collapse-icon">
            {#if collapsedFilters[filter.id]}
              <ChevronRight size={14} color="#94a3b8" />
            {:else}
              <ChevronDown size={14} color="#94a3b8" />
            {/if}
          </span>
        </button>
        
        {#if !collapsedFilters[filter.id]}
          {#if filter.type === 'multiselect'}
          <div class="options">
            {#each filter.options as opt}
              <button 
                class="option-btn" 
                class:active={activeFilters[filter.id]?.includes(opt.value)}
                on:click={() => toggleOption(filter.id, opt.value)}
              >
                <div class="check-box">
                  {#if activeFilters[filter.id]?.includes(opt.value)}
                    <Check size={12} strokeWidth={3} />
                  {/if}
                </div>
                <span>{opt.label}</span>
              </button>
            {/each}
          </div>
        {:else if filter.type === 'slider'}
          <div class="slider-group">
            <input 
              type="range" 
              min={filter.min} 
              max={filter.max} 
              value={activeFilters[filter.id] || filter.min}
              on:input={(e) => handleSlider(filter.id, e)}
            />
            <div class="slider-labels">
               <span>{filter.min}</span>
               <span class="current">{activeFilters[filter.id] || filter.min}</span>
               <span>{filter.max}</span>
            </div>
          </div>
        {:else if filter.type === 'datepicker'}
          <div class="datepicker-group">
            <input
              type="date"
              min={filter.min}
              max={filter.max}
              value={activeFilters[filter.id] || ''}
              on:change={(e) => handleDatePicker(filter.id, e)}
            />
            {#if activeFilters[filter.id]}
              <span class="date-hint">Updated on or after {activeFilters[filter.id]}</span>
            {/if}
          </div>
        {/if}
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .filter-panel {
    background: transparent;
    padding: 1.5rem;
    height: 100%;
    overflow-y: auto;
    font-family: inherit;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    color: #475569;
    padding-bottom: 0.5rem;
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
    transition: all 0.2s;
  }
  .reset-btn:hover {
    background: #f1f5f9;
    border-color: #94a3b8;
    color: #0f172a;
  }
  .collapse-btn {
    margin-left: auto;
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
    border-color: #cbd5e1;
  }
  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .filter-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 0;
    width: 100%;
    text-align: left;
  }
  .filter-group-header:hover .filter-label {
    color: #0f172a;
  }
  .collapse-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .option-btn {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    font-size: 0.875rem;
    color: #64748b;
    padding: 6px 8px;
    border-radius: 6px;
    transition: all 0.2s;
  }
  .option-btn:hover {
    background: #f1f5f9;
    color: #0f172a;
  }
  .option-btn.active {
    color: #0284c7;
    font-weight: 500;
  }
  .check-box {
    width: 18px;
    height: 18px;
    border: 2px solid #cbd5e1;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    background: white;
    flex-shrink: 0;
  }
  .active .check-box {
    background: #0284c7;
    border-color: #0284c7;
    color: white;
  }
  .slider-group {
    padding: 0 4px;
  }
  input[type="range"] {
    width: 100%;
    margin-bottom: 8px;
    cursor: pointer;
    accent-color: #0284c7;
  }
  .slider-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #94a3b8;
  }
  .current {
    color: #0284c7;
    font-weight: 700;
  }
  .datepicker-group {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  input[type="date"] {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 0.875rem;
    color: #1e293b;
    background: white;
    cursor: pointer;
    accent-color: #0284c7;
  }
  input[type="date"]:focus {
    outline: none;
    border-color: #0284c7;
  }
  .date-hint {
    font-size: 0.75rem;
    color: #0284c7;
    font-weight: 500;
  }
</style>
