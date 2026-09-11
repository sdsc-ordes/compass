<script lang="ts">
  /**
   * The entity types as counted pills, in the results block.
   *
   * The type is the coarsest cut in the data — what KIND of thing this is — and
   * it reads better as a shape of the result set than as a list of options: each
   * pill carries how many entities it would leave standing, so the count a
   * visitor is choosing between is on screen before they choose. The accordion
   * section this replaced could never show that; entityType has no property path
   * to facet on, and the numbers only exist because sparqlBuilder now counts the
   * type variable itself.
   *
   * ONE AT A TIME, not a set of independent toggles. Pressing a type selects
   * that type alone, pressing it again goes back to all of them, and "all" is a
   * pill of its own rather than an absence — four outlined pills look like
   * nothing is selected, when in fact everything is included, which is the one
   * thing about this control that has to be legible at a glance.
   *
   * The numbers are drill-down counts, so a pill's own dimension is excluded
   * from them: choosing one type does not make the other three collapse to what
   * is left beside it. They answer "how many are there of this", and they hold
   * still while the eye moves along the row.
   *
   * Pills, filled when chosen, outlined when not. That is the same inversion the
   * detail pane uses between an entry's type and its tags, turned to a second
   * purpose here — shape says "type", fill says "chosen".
   *
   * The names on them are short — Partners, Foren — and the ontology's own are
   * not. Five chips carrying "Partnerorganisationen" and "Internationale Foren"
   * cannot be arranged tidily in a 420px sidebar, let alone a 390px screen:
   * every one of them claims a row, or wraps inside itself, and the band reads
   * as a mess either way. So the chips abbreviate and nothing else does. Each
   * one still announces its full name, and the detail pane still states it in
   * full, which is where the type is a fact about an entry rather than a
   * control — the shorthand lives only here, where space decides.
   */
  import { fmt, plural, typeLabel, type Strings } from '../lib/i18n';
  import type { Dim } from '../lib/schema';

  export let t: Strings;
  /** The type dimension, straight off the schema. Null before it has loaded. */
  export let dim: Dim | null = null;
  export let sel: Record<string, Set<string>> = {};
  /** Drill-down counts from getFacets: dimension id -> tag IRI -> count. */
  export let facets: Record<string, Record<string, number>> = {};
  /** A pill turned on from the detail pane, marked until the eye has found it. */
  export let juston: string | null = null;
  /** Chooses one type, or every type when the IRI is null. */
  export let onPickType: (iri: string | null) => void;

  let pillsEl: HTMLElement | null = null;

  /** Focuses one type's pill — where the detail pane's type pill sends the caret
      once it has switched this dimension on. The [data-key] lookup belongs to
      whoever renders the attribute, which is this component. */
  export function focusPill(iri: string): void {
    pillsEl
      ?.querySelector<HTMLElement>(`.tpill[data-key="${iri}"]`)
      ?.focus({ preventScroll: true });
  }

  /**
   * `f` is an argument rather than a closure read, so each caller's expression
   * depends on `facets` itself — otherwise the counts never refresh. Same reason
   * as FilterRows.countOf, which this deliberately mirrors.
   *
   * Null, not zero, while nothing has answered yet: the pills render before the
   * first getFacets returns, and a hard "0" there would be a wrong number rather
   * than a missing one.
   */
  const countOf = (
    f: Record<string, Record<string, number>>,
    id: string,
    iri: string,
  ): number | null => (f[id] ? (f[id][iri] ?? 0) : null);

  /* No type chosen means every type is in, which is what the All pill shows as
     its pressed state. */
  $: allOn = !dim || (sel[dim.id]?.size ?? 0) === 0;
</script>

{#if dim && dim.options.length}
  <!-- Named as a set, the way the accordion names its headers: what tells a
       screen-reader user these toggles are one control. The name is the
       dimension's own label, so it comes from the ontology like every other. -->
  <div class="tpills" bind:this={pillsEl} role="group" aria-label={dim.label}>
    <!-- All carries no number on purpose: the tally directly above it is already
         showing that same total in words, and a second copy of it here would
         read as a different figure to compare rather than the same one.
         One word, and it needs no more: the group around it is named for the
         dimension, so this announces as "Entity Type, All, pressed". -->
    <button
      type="button"
      class="tpill tpill-all"
      aria-pressed={allOn}
      on:click={() => onPickType(null)}>{t.allTypes}</button
    >
    {#each dim.options as opt (opt.value)}
      {@const n = countOf(facets, dim.id, opt.value)}
      {@const on = sel[dim.id]?.has(opt.value) ?? false}
      <!-- aria-pressed, as the option rows use: a toggle that stays down, not a
           link somewhere. The visible number is aria-hidden and the .sr span
           says it in words, so the name reads "Projects, 2 results" rather than
           "2 Projects" — and still begins with the visible label (WCAG 2.5.3). -->
      {@const short = typeLabel(n, opt.value, opt.label, t)}
      <button
        type="button"
        class="tpill"
        class:juston={juston === dim.id + opt.value}
        data-key={opt.value}
        data-empty={n === 0}
        aria-pressed={on}
        on:click={() => dim && onPickType(opt.value)}
      >
        <span class="tn" aria-hidden="true">{n ?? ''}</span>
        <!-- Short and inflected: one entity is a Partner, sixteen are Partners. -->
        <span class="tl">{short}</span>
        <!-- The full name follows the short one, so the chip announces
             "Partners, Partner Organizations, 16 results" — the visible word
             first, which is what WCAG 2.5.3 asks, and the ontology's own name
             after it for anyone who cannot see the group's label. Dropped when
             the two are the same word, which would otherwise announce
             "Networks, Networks". -->
        <span class="sr"
          >{short === opt.label ? '' : ', ' + opt.label}{n === null
            ? ''
            : fmt(plural(n, t.rowCountSrOne, t.rowCountSr), { n })}</span
        >
      </button>
    {/each}
  </div>
{/if}
