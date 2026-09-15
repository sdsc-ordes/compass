<script lang="ts">
  import { tick } from 'svelte';
  import FilterRows from './FilterRows.svelte';
  import Icon from './Icon.svelte';
  import { fmt, type Strings } from '../lib/i18n';
  import { REDUCED } from '../lib/projection';
  import type { Dim } from '../lib/schema';

  export let t: Strings;
  export let dims: Dim[] = [];
  export let openDim: string | null = null;
  export let sel: Record<string, Set<string>> = {};
  export let facets: Record<string, Record<string, number>> = {};
  export let juston: string | null = null;
  export let onToggleDim: (id: string) => void;
  export let onToggleOption: (dim: string, iri: string) => void;

  let accEl: HTMLElement | null = null;
  let rows: Record<string, FilterRows | null> = {};

  const EXPAND_MS = 240;

  export function focusHeader(id: string): void {
    accEl?.querySelector<HTMLElement>(`[data-head="${id}"]`)?.focus({ preventScroll: true });
  }

  export async function focusRow(dim: string, iri: string): Promise<void> {
    await tick();
    const pane = rows[dim];
    if (!pane) return;
    pane.focusRow(iri);
    afterExpanded(dim, () => pane.revealRow(iri));
  }

  function afterExpanded(id: string, cb: () => void): void {
    const panel = accEl?.querySelector<HTMLElement>(`[data-panel="${id}"]`);
    const inner = panel?.firstElementChild as HTMLElement | undefined;
    if (!panel || !inner || REDUCED.matches || panel.offsetHeight >= inner.scrollHeight) {
      cb();
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let done = false;
    const fire = (): void => {
      if (done) return;
      done = true;
      panel.removeEventListener('transitionend', onEnd);
      clearTimeout(timer);
      cb();
    };
    const onEnd = (e: TransitionEvent): void => {
      if (e.target === panel && e.propertyName === 'grid-template-rows') fire();
    };
    panel.addEventListener('transitionend', onEnd);
    timer = setTimeout(fire, EXPAND_MS + 80);
  }
</script>

<div class="acc" bind:this={accEl} role="group" aria-label={t.filterDimensions}>
  {#each dims as dim (dim.id)}
    {@const open = openDim === dim.id}
    {@const n = sel[dim.id]?.size ?? 0}
    <div class="asec" class:open>
      <h2>
        <button
          type="button"
          class="ahbtn"
          class:sub={!!dim.description}
          data-head={dim.id}
          id={'acch-' + dim.id}
          aria-expanded={open}
          aria-controls={'accp-' + dim.id}
          aria-label={n ? fmt(t.dimSelected, { label: dim.label, n }) : dim.label}
          aria-describedby={dim.description ? 'accd-' + dim.id : undefined}
          on:click={() => onToggleDim(dim.id)}
        >
          <span class="dico"
            >{#if dim.icon}<Icon name={dim.icon} size={16} />{/if}</span
          >
          <span class="lb"
            >{dim.label}{#if dim.description}<span class="dsc" id={'accd-' + dim.id}
                >{dim.description}</span
              >{/if}</span
          >
          <span class="cnt" class:off={n === 0} aria-hidden="true">{n || '0'}</span>
          <span class="chev"><Icon name="chevronUp" size={16} /></span>
        </button>
      </h2>
      <div class="apanel" data-panel={dim.id} inert={open ? undefined : true}>
        <div
          class="ainner"
          role="region"
          id={'accp-' + dim.id}
          aria-labelledby={'acch-' + dim.id}
        >
          <FilterRows
            bind:this={rows[dim.id]}
            {t}
            dim={dim.id}
            options={dim.options}
            {sel}
            {facets}
            {juston}
            {onToggleOption}
          />
        </div>
      </div>
    </div>
  {/each}
</div>
