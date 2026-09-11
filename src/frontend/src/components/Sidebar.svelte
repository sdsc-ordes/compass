<script lang="ts">
  /**
   * The 420px filter sidebar: the head, the tally, the type pills, the accordion
   * of the four remaining dimensions — and, while an entry is selected, the
   * detail pane that takes the same panel over.
   *
   * The type does not stack with the others. It is drawn in the results block as
   * counted pills, because it is the one dimension whose counts describe the
   * shape of the result set rather than narrow it — see TypePills.
   */
  import DetailPane from './DetailPane.svelte';
  import Tally from './Tally.svelte';
  import TypePills from './TypePills.svelte';
  import FilterAccordion from './FilterAccordion.svelte';
  import StoriesBlock from './StoriesBlock.svelte';
  import { plural, storyLine, type Strings } from '../lib/i18n';
  /* Inlined as a data URI by assetsInlineLimit — see vite.config.ts. */
  import logoSrc from '../assets/oceancare.png';
  import type { Proj } from '../lib/types';
  import { TYPE_DIM, type Dim } from '../lib/schema';

  export let t: Strings;
  export let dims: Dim[] = [];
  /** The dimension ids whose accordion sections stand open. */
  export let openDim: string | null = null;
  export let sel: Record<string, Set<string>> = {};
  /** Drill-down counts from getFacets: dimension id -> tag IRI -> count. */
  export let facets: Record<string, Record<string, number>> = {};
  /** Entities in the current selection, regions excluded. */
  export let resultCount = 0;
  /** Story total for the current selection — null whenever no backend answered. */
  export let storyCount: { count: number; url: string } | null = null;
  export let statusText = '';
  export let anyFilters = false;
  export let selected: Proj | null = null;
  /** dim + IRI of the row a detail-pane tag has just switched on. */
  export let juston: string | null = null;

  export let onToggleDim: (id: string) => void;
  export let onToggleOption: (dim: string, iri: string) => void;
  /** The type is one-of-many, not a toggle among many — see TypePills. */
  export let onPickType: (iri: string | null) => void;
  export let onReset: () => void;
  export let onCollapse: () => void;
  export let onBack: () => void;
  export let onCloseDetail: () => void;
  export let onFilterByTag: (dim: string, iri: string) => void;

  /* Bound out so CompassMap can set `inert`, scroll it, and measure the sheet.
     Nodes only, for the Sheet and the focus-on-open: moving focus *inside* the
     panel goes through the two methods below instead, so nothing outside this
     component runs a selector against its children. */
  export let sidebarEl: HTMLElement | null = null;
  export let grabEl: HTMLElement | null = null;
  export let tallyEl: HTMLElement | null = null;
  export let titleEl: HTMLHeadingElement | null = null;

  let acc: FilterAccordion | null = null;
  let pills: TypePills | null = null;

  /** Focus a dimension's accordion header — where an entry being closed puts the
      caret. */
  export function focusHeader(id: string): void {
    acc?.focusHeader(id);
  }
  /** Focus the row a detail-pane tag has just switched on, and reveal it once its
      section has finished opening. */
  export function focusRow(dim: string, iri: string): void {
    acc?.focusRow(dim, iri);
  }
  /** Focus one type's pill — the same landing for the type dimension, which has
      a pill in the results block instead of a row in a section. */
  export function focusPill(iri: string): void {
    pills?.focusPill(iri);
  }

  /* The type is drawn by the pills, the rest by the accordion. Split here rather
     than by the parent, so `dims` stays one list in DIM_IDS order and there is
     one place that knows which of them the pills have taken. */
  $: typeDim = dims.find((d) => d.id === TYPE_DIM) ?? null;
  $: sectionDims = dims.filter((d) => d.id !== TYPE_DIM);

  /** The mobile handle's headline: the panel's one line that is always on screen. */
  $: sheetTitle = selected ? t.detailsPane : t.filtersPane;
  /**
   * Docked, the count is the only part of the filters still visible, so the handle
   * carries it. A selected entry says its own thing below, so the handle says
   * nothing there rather than the same thing twice.
   *
   * The story line leads when there is one to lead with, applying the same test
   * the stories block applies, so the handle cannot promise "0 stories" for a
   * block that is showing its prompt instead. A backend answering zero falls back
   * to the result count, exactly as no backend at all does.
   */
  $: sheetCount = selected
    ? ''
    : storyCount && storyCount.count > 0
      ? storyLine(storyCount.count, t)
      : `${resultCount} ${plural(resultCount, t.tallyCaptionOne, t.tallyCaption)}`;
</script>

<aside class="filters" class:detail={!!selected} bind:this={sidebarEl}>
  <!-- Mobile only: the grip of the docked panel. -->
  <!-- No aria-label: it would replace the contents, and the count is why this is
       here. The contents are the name, the how-to is a description. -->
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
    <!-- The mark carries the wordmark, so there is no text name beside it —
         alt is what says "OceanCare". width/height are the intrinsic pixels, so
         the row reserves its height before the data URI decodes. -->
    <div class="logo">
      <img class="logomark" src={logoSrc} alt="OceanCare" width="232" height="103" />
    </div>
    <button class="collapse" type="button" aria-label={t.collapseSidebar} on:click={onCollapse}
      >&lsaquo;&lsaquo;</button
    >
  </div>

  <div class="pane-filters">
    <!-- Stories lead the pane: going to read is the errand we want to invite, and
         the result count describes what the map is already showing. On a phone
         the order is turned back over in CSS — see .pane-filters there: the dock
         stop shows whatever is first, and the tally is the band whose height is
         measured into --dock. -->
    {#if storyCount}
      <StoriesBlock {t} {storyCount} />
    {/if}
    <Tally {t} {resultCount} {anyFilters} {statusText} {onReset} bind:tallyEl />
    <!-- Below the tally on purpose: the counts on these pills add up to the
         number above them, so they read as that number broken apart. Outside the
         band the mobile dock measures, though — see lib/sheet.ts. -->
    <TypePills bind:this={pills} {t} dim={typeDim} {sel} {facets} {juston} {onPickType} />
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
    dimIds={dims.map((d) => d.id)}
    {onBack}
    onClose={onCloseDetail}
    {onFilterByTag}
    bind:titleEl
  />
</aside>
