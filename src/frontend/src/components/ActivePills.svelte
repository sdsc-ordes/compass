<script lang="ts">
  import { tick } from 'svelte';
  import { fmt, type Strings } from '../lib/i18n';
  import { TYPE_DIM, type Dim } from '../lib/schema';

  export let t: Strings;
  export let dims: Dim[] = [];
  export let sel: Record<string, Set<string>> = {};
  export let onToggleOption: (dim: string, iri: string) => void;
  export let onReset: () => void = () => {};
  // One scrolling row over the map (mobile): no folding, no reset.
  export let bar = false;

  let rowEl: HTMLElement | null = null;
  let shown = Infinity;
  // Mouse removals leave a blank in place until the pointer leaves, so nothing slides under it.
  let keepRemoved = false;
  let pointerType = '';
  // "dim iri" keys, newest first; fresh keys (a toggle, or a URL restore in URL order) go on top.
  let order: string[] = [];

  // Types have their own pill row.
  $: activeKeys = Object.entries(sel)
    .filter(([d]) => d !== TYPE_DIM)
    .flatMap(([d, s]) => [...s].map((v) => `${d} ${v}`));
  $: if (!activeKeys.length) keepRemoved = false;
  $: {
    const kept = order.filter((k) => activeKeys.includes(k) || keepRemoved);
    order = [...activeKeys.filter((k) => !order.includes(k)), ...kept];
  }
  $: items = order.flatMap((k) => {
    const [dim, iri] = k.split(' ');
    const o = dims.find((x) => x.id === dim)?.options.find((x) => x.value === iri);
    return o ? [{ key: k, dim, iri, label: o.label, gone: !sel[dim]?.has(iri) }] : [];
  });
  $: folded = items.slice(shown).filter((it) => !it.gone);

  let fitSeq = 0;

  // Unhide all, measure, fold; all before paint, so the unfolded layout never shows.
  async function fit(): Promise<void> {
    if (!rowEl || bar) return;
    const run = ++fitSeq;
    const pills = [...rowEl.querySelectorAll<HTMLElement>('.apill:not(.amore)')];
    const more = rowEl.querySelector<HTMLElement>('.amore');
    const reset = rowEl.querySelector<HTMLElement>('.areset');
    if (!pills.length || !more || !reset) return;
    rowEl.classList.add('measuring');
    pills.forEach((li) => {
      li.hidden = false;
      li.style.maxWidth = '';
    });
    more.hidden = false;
    const width = rowEl.clientWidth;
    const gap = parseFloat(getComputedStyle(rowEl).columnGap) || 0;
    const row1Top = pills[0].offsetTop;
    const row2Top = pills.find((p) => p.offsetTop > row1Top)?.offsetTop ?? Infinity;
    // the row is positioned, so offsets are relative to it
    const rightEdge = (i: number): number => pills[i].offsetLeft + pills[i].offsetWidth;
    let fits = pills.filter((p) => p.offsetTop <= row2Top).length;
    const tail = gap + reset.offsetWidth;
    if (fits < pills.length || (row2Top < Infinity && rightEdge(fits - 1) + tail > width)) {
      const room = (fits < pills.length ? width - gap - more.offsetWidth : width) - tail;
      while (fits > 1 && pills[fits - 1].offsetTop === row2Top && rightEdge(fits - 1) > room) {
        // a lone long pill on row 2 is capped so it ellipsizes beside "+N" and reset
        if (pills[fits - 2].offsetTop < row2Top) {
          pills[fits - 1].style.maxWidth = `${room}px`;
          break;
        }
        fits -= 1;
      }
    }
    pills.forEach((li, i) => (li.hidden = i >= fits));
    more.hidden = fits >= pills.length;
    rowEl.classList.remove('measuring');
    shown = fits;
    // The guess misses the final "+N" width; fold until it and reset sit in the two rows.
    const out = (el: HTMLElement): boolean =>
      !el.hidden && el.offsetTop + el.offsetHeight > rowEl!.clientHeight;
    for (;;) {
      await tick();
      if (run !== fitSeq || shown <= 1 || !(out(reset) || out(more))) return;
      shown -= 1;
    }
  }

  $: if (rowEl && items) void tick().then(fit);

  // Refit on width only.
  function refitOnResize(el: HTMLElement): { destroy: () => void } {
    let w = 0;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) void fit();
      w = el.clientWidth;
    });
    ro.observe(el);
    document.fonts?.ready.then(fit);
    return { destroy: () => ro.disconnect() };
  }

  const focusFilters = (): void =>
    rowEl?.nextElementSibling?.querySelector<HTMLElement>('button')?.focus();

  // Focus the next pill, else the previous one, else the filters (the map, for the bar); never body.
  async function remove(e: MouseEvent, it: { dim: string; iri: string }): Promise<void> {
    const li = (e.currentTarget as HTMLElement).closest('li')!;
    keepRemoved = e.detail > 0 && pointerType === 'mouse';
    const shownPills = '.apill:not(.amore,.gone,[hidden])';
    const pills = [...rowEl!.querySelectorAll<HTMLElement>(shownPills)];
    const i = pills.indexOf(li);
    const next = pills[i + 1] ?? pills[i - 1];
    onToggleOption(it.dim, it.iri);
    await tick();
    const target = next?.isConnected && next.querySelector<HTMLElement>('.ax');
    if (target) target.focus();
    else if (bar) rowEl?.closest<HTMLElement>('.stage')?.focus();
    else focusFilters();
  }

  async function reset(): Promise<void> {
    onReset();
    await tick();
    focusFilters();
  }
</script>

<!-- always rendered, so its fixed two-row height never shifts the filters -->
<ul
  class="apills"
  bind:this={rowEl}
  use:refitOnResize
  on:pointerdown={(e) => (pointerType = e.pointerType)}
  on:pointerleave={() => (keepRemoved = false)}
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
          on:click={(e) => remove(e, it)}><span aria-hidden="true">&times;</span></button
        >
      </li>
    {/each}
    {#if !bar}
      <!-- svelte-ignore a11y-no-noninteractive-tabindex -->
      <li class="tpill apill amore" tabindex="0" hidden={!folded.length}>
        <span aria-hidden="true">+{folded.length}</span>
        <span class="atip"
          >{fmt(t.moreFilters, {
            n: folded.length,
            labels: folded.map((h) => h.label).join(', '),
          })}</span
        >
      </li>
      <li class="areset">
        <button class="reset" type="button" on:click={reset}>{t.resetFiltersLong}</button>
      </li>
    {/if}
  {/if}
</ul>
