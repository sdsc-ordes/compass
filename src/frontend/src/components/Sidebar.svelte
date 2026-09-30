<script lang="ts">
  import DetailPane from './DetailPane.svelte';
  import Tally from './Tally.svelte';
  import TypePills from './TypePills.svelte';
  import ActivePills from './ActivePills.svelte';
  import FilterAccordion from './FilterAccordion.svelte';
  import CountBadge from './CountBadge.svelte';
  import { tick } from 'svelte';
  import { plural, type Strings } from '../lib/i18n';
  import type { StoryCount } from '../lib/stories';
  import type { Entry } from '../lib/types';
  import { TYPE_DIM, type Dim } from '../lib/schema';

  export let t: Strings;
  export let dims: Dim[] = [];
  export let openDim: string | null = null;
  export let sel: Record<string, Set<string>> = {};
  export let facets: Record<string, Record<string, number>> = {};
  export let resultCount = 0;
  export let storyCount: StoryCount | null = null;
  export let storiesPending = false;
  export let statusText = '';
  export let selected: Entry | null = null;
  export let juston: string | null = null;

  export let onToggleDim: (id: string) => void;
  export let onToggleOption: (dim: string, iri: string, el?: HTMLElement) => void;
  export let onPickType: (iri: string | null, el?: HTMLElement) => void;
  export let onReset: () => void;
  export let onBack: () => void;
  export let onCloseDetail: () => void;
  export let onFilterByTag: (dim: string, iri: string) => void;

  export let sidebarEl: HTMLElement | null = null;
  export let grabEl: HTMLElement | null = null;
  export let tallyEl: HTMLElement | null = null;
  export let titleEl: HTMLHeadingElement | null = null;

  let accordion: FilterAccordion | null = null;
  let typePills: TypePills | null = null;

  export function focusHeader(id: string): void {
    accordion?.focusHeader(id);
  }
  export function focusRow(dim: string, iri: string): void {
    accordion?.focusRow(dim, iri);
  }
  export function focusPill(iri: string): void {
    typePills?.focusPill(iri);
  }

  $: typeDim = dims.find((d) => d.id === TYPE_DIM) ?? null;
  $: sectionDims = dims.filter((d) => d.id !== TYPE_DIM);

  $: selectedCount = Object.values(sel).reduce((n, s) => n + s.size, 0);

  // Clears from the docked sheet; focus falls back to the grab it sat in.
  async function clear(): Promise<void> {
    onReset();
    await tick();
    grabEl?.focus();
  }

  $: sheetTitle = selected ? t.detailsPane : t.filtersPane;
  $: sheetCount = selected
    ? ''
    : `${resultCount} ${plural(resultCount, t.tallyCaptionOne, t.tallyCaption)}`;
</script>

<aside class="filters" class:detail={!!selected} bind:this={sidebarEl}>
  <div
    class="sheet-grab"
    bind:this={grabEl}
    role="button"
    tabindex="0"
    aria-expanded="false"
    aria-describedby="grabhow"
  >
    <span class="grabbar"></span>
    <span class="sr" id="grabhow">{t.sheetHow}</span>
    <div class="grabrow">
      <span class="grabtitle">{sheetTitle}</span>
      {#if !selected && selectedCount}<CountBadge {t} n={selectedCount} />{/if}
      <span class="grabcount">{sheetCount}</span>
      {#if !selected && selectedCount}
        <!-- kept from the grab's drag and toggle handlers in sheet.ts -->
        <button
          type="button"
          class="reset grabclear"
          on:pointerdown|stopPropagation
          on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && e.stopPropagation()}
          on:click={clear}>{t.clearFilters}</button
        >
      {/if}
    </div>
  </div>

  <div class="pane-filters">
    <Tally {t} {resultCount} {storyCount} {storiesPending} {statusText} bind:tallyEl />
    <TypePills bind:this={typePills} {t} dim={typeDim} {sel} {facets} {juston} {onPickType} />
    <ActivePills {t} {dims} {sel} {onToggleOption} {onReset} />
    <FilterAccordion
      bind:this={accordion}
      {t}
      dims={sectionDims}
      {openDim}
      {sel}
      {facets}
      {juston}
      {onToggleDim}
      {onToggleOption}
    />
  </div>

  <DetailPane
    {t}
    entry={selected}
    {dims}
    {onBack}
    onClose={onCloseDetail}
    {onFilterByTag}
    bind:titleEl
  />

  <footer class="sidefoot">
    {t.creditBefore}<span class="heart" aria-hidden="true">&#9829;</span><span class="sr"
      >{t.creditLove}</span
    >
    {t.creditAfter}
    <a href="https://www.datascience.ch" target="_blank" rel="noopener noreferrer"
      >Swiss Data Science Center</a
    >
  </footer>
</aside>
