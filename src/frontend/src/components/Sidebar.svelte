<script lang="ts">
  import { onDestroy } from 'svelte';
  import DetailPane from './DetailPane.svelte';
  import Tally from './Tally.svelte';
  import TypePills from './TypePills.svelte';
  import FilterAccordion from './FilterAccordion.svelte';
  import { plural, storyLine, type Strings } from '../lib/i18n';
  import logoSrc from '../assets/oceancare.png';
  import type { Proj } from '../lib/types';
  import { TYPE_DIM, type Dim } from '../lib/schema';

  export let t: Strings;
  export let dims: Dim[] = [];
  export let openDim: string | null = null;
  export let sel: Record<string, Set<string>> = {};
  export let facets: Record<string, Record<string, number>> = {};
  export let resultCount = 0;
  export let storyCount: { count: number; url: string } | null = null;
  export let storiesPending = false;
  export let statusText = '';
  export let anyFilters = false;
  export let selected: Proj | null = null;
  export let juston: string | null = null;

  export let onToggleDim: (id: string) => void;
  export let onToggleOption: (dim: string, iri: string) => void;
  export let onPickType: (iri: string | null) => void;
  export let onReset: () => void;
  export let onBack: () => void;
  export let onCloseDetail: () => void;
  export let onFilterByTag: (dim: string, iri: string) => void;

  export let sidebarEl: HTMLElement | null = null;
  export let grabEl: HTMLElement | null = null;
  export let tallyEl: HTMLElement | null = null;
  export let titleEl: HTMLHeadingElement | null = null;

  let acc: FilterAccordion | null = null;
  let pills: TypePills | null = null;

  export function focusHeader(id: string): void {
    acc?.focusHeader(id);
  }
  export function focusRow(dim: string, iri: string): void {
    acc?.focusRow(dim, iri);
  }
  export function focusPill(iri: string): void {
    pills?.focusPill(iri);
  }

  // Closing the detail pane used to swap the panes on display, which reads as a
  // jump. Animate the filters back in rather than the detail out: dismissing an
  // entry puts focus back in the filters, and focus cannot land in a subtree
  // still held at display:none for an outgoing animation.
  let back = false;
  let backTimer: ReturnType<typeof setTimeout> | null = null;
  let wasDetail = false;
  $: {
    const isDetail = !!selected;
    if (wasDetail && !isDetail) {
      back = true;
      if (backTimer) clearTimeout(backTimer);
      backTimer = setTimeout(() => {
        back = false;
        backTimer = null;
      }, 220); // just past the 0.19s animation in detail.css
    }
    wasDetail = isDetail;
  }
  onDestroy(() => {
    if (backTimer) clearTimeout(backTimer);
  });

  $: typeDim = dims.find((d) => d.id === TYPE_DIM) ?? null;
  $: sectionDims = dims.filter((d) => d.id !== TYPE_DIM);

  $: sheetTitle = selected ? t.detailsPane : t.filtersPane;
  $: sheetCount = selected
    ? ''
    : storyCount && storyCount.count > 0
      ? storyLine(storyCount.count, t)
      : `${resultCount} ${plural(resultCount, t.tallyCaptionOne, t.tallyCaption)}`;
</script>

<aside class="filters" class:detail={!!selected} class:back bind:this={sidebarEl}>
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
      <span class="grabcount">{sheetCount}</span>
    </div>
  </div>

  <div class="sidehead">
    <div class="logo">
      <a
        class="logolink"
        href={t.oceancareHome}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${t.oceancareHomeOf} ${t.newTab}`}
      >
        <img class="logomark" src={logoSrc} alt="OceanCare" width="232" height="103" />
      </a>
    </div>
  </div>

  <div class="pane-filters">
    <Tally {t} {resultCount} {storyCount} {storiesPending} {statusText} bind:tallyEl />
    <TypePills bind:this={pills} {t} dim={typeDim} {sel} {facets} {juston} {onPickType} />
    <div class="resetrow">
      <button
        class="reset"
        class:off={!anyFilters}
        type="button"
        disabled={!anyFilters}
        on:click={onReset}>{t.resetFiltersLong}</button
      >
    </div>
    <FilterAccordion
      bind:this={acc}
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
