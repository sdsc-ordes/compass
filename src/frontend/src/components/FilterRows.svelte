<script lang="ts">
  /**
   * One dimension's options as checkbox rows, with their drill-down counts, plus
   * the meta line that counts them.
   *
   * There is one of these per dimension now, inside its accordion section, rather
   * than one showing whichever dimension was active. The section's own opening is
   * what animates the rows into view, so the rows no longer stagger themselves in
   * — five copies of that stagger would all have played, unseen, at mount.
   */
  import { fmt, plural, type Strings } from '../lib/i18n';
  import { Sheet } from '../lib/sheet';
  import type { Option } from '../lib/schema';

  export let t: Strings;
  /** The dimension these rows belong to. */
  export let dim = '';
  export let options: Option[] = [];
  export let sel: Record<string, Set<string>> = {};
  /** Drill-down counts from getFacets: dimension id -> tag IRI -> count. */
  export let facets: Record<string, Record<string, number>> = {};
  /** A row turned on from the detail pane, marked until the eye has found it. */
  export let juston: string | null = null;
  export let onToggleOption: (dim: string, iri: string) => void;

  let chipsEl: HTMLElement | null = null;

  /** The [data-key] lookup stays with the rows that render the attribute. */
  const rowFor = (iri: string): HTMLElement | null =>
    chipsEl?.querySelector<HTMLElement>(`.frow[data-key="${iri}"]`) ?? null;

  /** Focuses a tag's row and moves nothing — the detail pane's "filter by this
      tag" asks for this while the row's section may still be opening, and a
      scroll aimed into a section at zero height lands nowhere useful. */
  export function focusRow(iri: string): void {
    rowFor(iri)?.focus({ preventScroll: true });
  }

  /** Brings that row into view. Asked for once the section has finished opening;
      FilterAccordion is what decides when that is. */
  export function revealRow(iri: string): void {
    rowFor(iri)?.scrollIntoView({ block: 'center', behavior: Sheet.scrollBehavior() });
  }

  $: picked = sel[dim]?.size ?? 0;

  /**
   * The drill-down count for a tag: getFacets excludes the tag's own dimension
   * from the filter, which is the rule the design's rows assume.
   *
   * `f` is an argument rather than a closure read, so each caller's expression
   * depends on `facets` itself — otherwise the counts never refresh.
   *
   * Null, not zero, for a dimension getFacets reports nothing for (relatedProject
   * and forum are excluded): unknown rather than empty, so no number is shown.
   */
  const countOf = (
    f: Record<string, Record<string, number>>,
    dim: string,
    iri: string,
  ): number | null => (f[dim] ? (f[dim][iri] ?? 0) : null);
</script>

<div class="dimmeta">
  <span class="c"
    >{fmt(plural(options.length, t.dimOptionCount, t.dimOptionsCount), {
      n: options.length,
      m: picked,
    })}</span
  >
</div>

<div class="chips" bind:this={chipsEl}>
  {#each options as opt (opt.value)}
    {@const n = countOf(facets, dim, opt.value)}
    {@const on = sel[dim]?.has(opt.value) ?? false}
    <button
      type="button"
      class="frow"
      class:juston={juston === dim + opt.value}
      data-dim={dim}
      data-key={opt.value}
      data-empty={n === 0}
      aria-pressed={on}
      on:click={() => onToggleOption(dim, opt.value)}
    >
      <span class="mk"></span>
      <span class="t">
        <b>{opt.label}</b>
        {#if opt.description}<i>{opt.description}</i>{/if}
      </span>
      <span class="n" aria-hidden="true">{n ?? ''}</span>
      <span class="sr"
        >{n === null ? '' : fmt(plural(n, t.rowCountSrOne, t.rowCountSr), { n })}</span
      >
    </button>
  {/each}
</div>
