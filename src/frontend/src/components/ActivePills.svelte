<script lang="ts">
  import { tick } from 'svelte';
  import { fmt, typeLabel, type Strings } from '../lib/i18n';
  import { TYPE_DIM, type Dim } from '../lib/schema';

  export let t: Strings;
  export let dims: Dim[] = [];
  export let sel: Record<string, Set<string>> = {};
  export let onToggleOption: (dim: string, iri: string) => void;
  export let onReset: () => void;

  let rowEl: HTMLElement | null = null;
  let shown = Infinity;
  let measuring = false;
  // "dim iri" keys, newest first; fresh keys (a toggle, or a URL restore in URL order) go on top.
  let order: string[] = [];

  $: {
    const now = Object.entries(sel).flatMap(([d, s]) => [...s].map((v) => `${d} ${v}`));
    order = [...now.filter((k) => !order.includes(k)), ...order.filter((k) => now.includes(k))];
  }
  $: items = order.flatMap((k) => {
    const [dim, iri] = k.split(' ');
    const d = dims.find((x) => x.id === dim);
    const o = d?.options.find((x) => x.value === iri);
    return o
      ? [{ dim, iri, label: dim === TYPE_DIM ? typeLabel(iri, o.label, t) : o.label }]
      : [];
  });
  $: visible = measuring ? items : items.slice(0, shown);
  $: hidden = measuring ? [] : items.slice(shown);

  // Lay every pill out unshrunk and wrapped, then keep two rows with "+N" and reset closing the last.
  async function fit(): Promise<void> {
    if (!rowEl) return;
    measuring = true;
    await tick();
    const w = rowEl?.clientWidth ?? 0;
    const pills = [...(rowEl?.querySelectorAll<HTMLElement>('.apill:not(.amore)') ?? [])];
    const more = rowEl?.querySelector<HTMLElement>('.amore');
    const reset = rowEl?.querySelector<HTMLElement>('.areset');
    if (rowEl && w && pills.length) {
      const left = rowEl.getBoundingClientRect().left;
      const gap = parseFloat(getComputedStyle(rowEl).columnGap) || 0;
      const end = (i: number): number => pills[i].getBoundingClientRect().right - left;
      const r2 = pills.find((p) => p.offsetTop > pills[0].offsetTop)?.offsetTop ?? Infinity;
      let k = pills.filter((p) => p.offsetTop <= r2).length;
      const tail = gap + (reset?.offsetWidth ?? 0);
      if (k < pills.length || (r2 < Infinity && end(k - 1) + tail > w)) {
        const room = w - gap - (more?.offsetWidth ?? 0) - tail;
        while (k > 1 && pills[k - 1].offsetTop === r2 && end(k - 1) > room) k -= 1;
      }
      shown = k;
    }
    measuring = false;
  }

  $: if (rowEl) void (items, fit());

  function watch(el: HTMLElement): { destroy: () => void } {
    const ro = new ResizeObserver(() => void fit());
    ro.observe(el);
    document.fonts?.ready.then(() => void fit());
    return { destroy: () => ro.disconnect() };
  }
</script>

{#if items.length}
  <ul class="apills" class:measuring bind:this={rowEl} use:watch aria-label={t.activeFilters}>
    {#each visible as it (it.dim + it.iri)}
      <li class="tpill apill">
        <span class="al">{it.label}</span>
        <button
          type="button"
          class="ax"
          aria-label={fmt(t.removeFilter, { label: it.label })}
          on:click={() => onToggleOption(it.dim, it.iri)}
          ><span aria-hidden="true">×</span></button
        >
      </li>
    {/each}
    {#if measuring || hidden.length}
      <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
      <li class="tpill apill amore" tabindex="0">
        <span aria-hidden="true">+{measuring ? items.length : hidden.length}</span>
        <span class="atip"
          >{fmt(t.moreFilters, {
            n: hidden.length,
            labels: hidden.map((h) => h.label).join(', '),
          })}</span
        >
      </li>
    {/if}
    <li class="areset">
      <button class="reset" type="button" on:click={onReset}>{t.resetFiltersLong}</button>
    </li>
  </ul>
{/if}
