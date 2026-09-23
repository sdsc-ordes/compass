<script lang="ts">
  import { fmt, plural, typeLabel, type Strings } from '../lib/i18n';
  import type { Dim } from '../lib/schema';

  export let t: Strings;
  export let dim: Dim | null = null;
  export let sel: Record<string, Set<string>> = {};
  export let facets: Record<string, Record<string, number>> = {};
  export let juston: string | null = null;
  export let onPickType: (iri: string | null) => void;

  let pillsEl: HTMLElement | null = null;

  export function focusPill(iri: string): void {
    pillsEl
      ?.querySelector<HTMLElement>(`.tpill[data-key="${iri}"]`)
      ?.focus({ preventScroll: true });
  }

  const countOf = (
    f: Record<string, Record<string, number>>,
    id: string,
    iri: string,
  ): number | null => (f[id] ? (f[id][iri] ?? 0) : null);

  $: allOn = !dim || (sel[dim.id]?.size ?? 0) === 0;
</script>

{#if dim && dim.options.length}
  <div class="tpills" bind:this={pillsEl} role="group" aria-label={dim.label}>
    <button
      type="button"
      class="tpill tpill-all"
      aria-pressed={allOn}
      on:click={() => onPickType(null)}>{t.allTypes}</button
    >
    {#each dim.options as opt (opt.value)}
      {@const n = countOf(facets, dim.id, opt.value)}
      {@const on = sel[dim.id]?.has(opt.value) ?? false}
      {@const short = typeLabel(opt.value, opt.label, t)}
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
        <span class="tl">{short}</span>
        <span class="sr"
          >{short === opt.label ? '' : ', ' + opt.label}{n === null
            ? ''
            : fmt(plural(n, t.rowCountSrOne, t.rowCountSr), { n })}</span
        >
      </button>
    {/each}
  </div>
{/if}
