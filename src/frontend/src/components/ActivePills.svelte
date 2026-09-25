<script lang="ts">
  import { tick } from 'svelte';
  import { fmt, type Strings } from '../lib/i18n';
  import { TYPE_DIM, type Dim } from '../lib/schema';

  export let t: Strings;
  export let dims: Dim[] = [];
  export let sel: Record<string, Set<string>> = {};
  export let onToggleOption: (dim: string, iri: string) => void;
  export let onReset: () => void;

  let rowEl: HTMLElement | null = null;
  let shown = Infinity;
  // Mouse removals leave a blank in place until the pointer leaves, so nothing slides under it.
  let hold = false;
  let ptr = '';
  // "dim iri" keys, newest first; fresh keys (a toggle, or a URL restore in URL order) go on top.
  // Types have their own pill row.
  let order: string[] = [];

  $: now = Object.entries(sel)
    .filter(([d]) => d !== TYPE_DIM)
    .flatMap(([d, s]) => [...s].map((v) => `${d} ${v}`));
  $: if (!now.length) hold = false;
  $: {
    const kept = order.filter((k) => now.includes(k) || hold);
    order = [...now.filter((k) => !order.includes(k)), ...kept];
  }
  $: items = order.flatMap((k) => {
    const [dim, iri] = k.split(' ');
    const o = dims.find((x) => x.id === dim)?.options.find((x) => x.value === iri);
    return o ? [{ key: k, dim, iri, label: o.label, gone: !sel[dim]?.has(iri) }] : [];
  });
  $: hidden = items.slice(shown).filter((it) => !it.gone);

  let runs = 0;

  // Unhide all, measure, fold; all before paint, so the unfolded layout never shows.
  async function fit(): Promise<void> {
    if (!rowEl) return;
    const run = ++runs;
    const lis = [...rowEl.querySelectorAll<HTMLElement>('.apill:not(.amore)')];
    const more = rowEl.querySelector<HTMLElement>('.amore');
    const reset = rowEl.querySelector<HTMLElement>('.areset');
    if (!lis.length || !more || !reset) return;
    rowEl.classList.add('measuring');
    lis.forEach((li) => {
      li.hidden = false;
      li.style.maxWidth = '';
    });
    more.hidden = false;
    const w = rowEl.clientWidth;
    const gap = parseFloat(getComputedStyle(rowEl).columnGap) || 0;
    const top = lis[0].offsetTop;
    const r2 = lis.find((p) => p.offsetTop > top)?.offsetTop ?? Infinity;
    // the row is positioned, so offsets are relative to it
    const end = (i: number): number => lis[i].offsetLeft + lis[i].offsetWidth;
    let k = lis.filter((p) => p.offsetTop <= r2).length;
    const tail = gap + reset.offsetWidth;
    if (k < lis.length || (r2 < Infinity && end(k - 1) + tail > w)) {
      const room = (k < lis.length ? w - gap - more.offsetWidth : w) - tail;
      while (k > 1 && lis[k - 1].offsetTop === r2 && end(k - 1) > room) {
        // a lone long pill on row 2 is capped so it ellipsizes beside "+N" and reset
        if (lis[k - 2].offsetTop < r2) {
          lis[k - 1].style.maxWidth = `${room}px`;
          break;
        }
        k -= 1;
      }
    }
    lis.forEach((li, i) => (li.hidden = i >= k));
    more.hidden = k >= lis.length;
    rowEl.classList.remove('measuring');
    shown = k;
    // The guess misses the final "+N" width; fold until it and reset sit in the two rows.
    const out = (el: HTMLElement): boolean =>
      !el.hidden && el.offsetTop + el.offsetHeight > rowEl!.clientHeight;
    for (;;) {
      await tick();
      if (run !== runs || shown <= 1 || !(out(reset) || out(more))) return;
      shown -= 1;
    }
  }

  $: if (rowEl) void (items, tick().then(fit));

  // Refit on width only.
  function watch(el: HTMLElement): { destroy: () => void } {
    let w = 0;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) void fit();
      w = el.clientWidth;
    });
    ro.observe(el);
    document.fonts?.ready.then(fit);
    return { destroy: () => ro.disconnect() };
  }

  // Focus the next pill's ×, else the previous one, else the filters; never body.
  async function remove(e: MouseEvent, it: { dim: string; iri: string }): Promise<void> {
    const li = (e.currentTarget as HTMLElement).closest('li')!;
    const acc = rowEl?.nextElementSibling;
    hold = e.detail > 0 && ptr === 'mouse';
    const q = '.apill:not(.amore,.gone,[hidden])';
    const pills = [...rowEl!.querySelectorAll<HTMLElement>(q)];
    const i = pills.indexOf(li);
    const next = pills[i + 1] ?? pills[i - 1];
    onToggleOption(it.dim, it.iri);
    await tick();
    const to = next?.isConnected && next.querySelector<HTMLElement>('.ax');
    if (to) to.focus();
    else acc?.querySelector<HTMLElement>('button')?.focus();
  }

  async function reset(): Promise<void> {
    const acc = rowEl?.nextElementSibling;
    onReset();
    await tick();
    acc?.querySelector<HTMLElement>('button')?.focus();
  }
</script>

<!-- always rendered, so its fixed two-row height never shifts the filters -->
<ul
  class="apills"
  bind:this={rowEl}
  use:watch
  on:pointerdown={(e) => (ptr = e.pointerType)}
  on:pointerleave={() => (hold = false)}
  aria-label={t.activeFilters}
>
  {#if items.some((it) => !it.gone)}
    {#each items as it, i (it.key)}
      <li class="tpill apill" class:gone={it.gone} hidden={i >= shown}>
        <span class="al">{it.label}</span>
        <button
          type="button"
          class="ax"
          tabindex={it.gone ? -1 : undefined}
          aria-label={fmt(t.removeFilter, { label: it.label })}
          on:click={(e) => remove(e, it)}><span aria-hidden="true">×</span></button
        >
      </li>
    {/each}
    <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
    <li class="tpill apill amore" tabindex="0" hidden={!hidden.length}>
      <span aria-hidden="true">+{hidden.length}</span>
      <span class="atip"
        >{fmt(t.moreFilters, {
          n: hidden.length,
          labels: hidden.map((h) => h.label).join(', '),
        })}</span
      >
    </li>
    <li class="areset">
      <button class="reset" type="button" on:click={reset}>{t.resetFiltersLong}</button>
    </li>
  {/if}
</ul>
