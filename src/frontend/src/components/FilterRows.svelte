<script lang="ts">
  import { fmt, plural, type Strings } from '../lib/i18n';
  import { Sheet } from '../lib/sheet';
  import type { Option } from '../lib/schema';

  export let t: Strings;
  export let dim = '';
  export let options: Option[] = [];
  export let sel: Record<string, Set<string>> = {};
  export let facets: Record<string, Record<string, number>> = {};
  export let juston: string | null = null;
  export let onToggleOption: (dim: string, iri: string) => void;

  let chipsEl: HTMLElement | null = null;

  const rowFor = (iri: string): HTMLElement | null =>
    chipsEl?.querySelector<HTMLElement>(`.frow[data-key="${iri}"]`) ?? null;

  export function focusRow(iri: string): void {
    rowFor(iri)?.focus({ preventScroll: true });
  }

  export function revealRow(iri: string): void {
    rowFor(iri)?.scrollIntoView({ block: 'center', behavior: Sheet.scrollBehavior() });
  }

  $: picked = sel[dim]?.size ?? 0;

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
