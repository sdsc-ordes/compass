<script lang="ts">
  /**
   * The filter dimensions as an accordion: five headers stacked in the panel,
   * each opening its own option rows in place.
   *
   * It replaced a tab strip, and the reason is worth keeping: five labels do not
   * go into the one 368px row the strip had, so the strip scrolled sideways with
   * its scrollbar hidden to save vertical room — and two of the five dimensions
   * sat off screen with nothing saying they existed. Stacking spends vertical
   * room, which a 420px sidebar has and a single row did not, to show all five
   * names at once. styles/filters.css carries the measurements.
   *
   * This is the accordion pattern, not a tablist, and it stays that way now that
   * only one section opens at a time: a header button with aria-expanded
   * controlling a region beneath it, which the same press can shut again to
   * leave none open. A tablist always has exactly one panel selected and its
   * panels are not each under their own header, so it is the wrong contract
   * here — and no arrow-key navigation, which the pattern makes optional and
   * the tab order alone already serves.
   *
   * One section is open at a time, so opening one is what closes the last. Which
   * one that is belongs to the parent rather than to this component, since the
   * detail pane's "filter by this tag" has to open a section from outside.
   */
  import { tick } from 'svelte';
  import FilterRows from './FilterRows.svelte';
  import Icon from './Icon.svelte';
  import { fmt, type Strings } from '../lib/i18n';
  import { REDUCED } from '../lib/projection';
  import type { Dim } from '../lib/schema';

  export let t: Strings;
  export let dims: Dim[] = [];
  /** The dimension whose section stands open, or null when none does. */
  export let openDim: string | null = null;
  export let sel: Record<string, Set<string>> = {};
  /** Drill-down counts from getFacets: dimension id -> tag IRI -> count. */
  export let facets: Record<string, Record<string, number>> = {};
  /** A row turned on from the detail pane, marked until the eye has found it. */
  export let juston: string | null = null;
  export let onToggleDim: (id: string) => void;
  export let onToggleOption: (dim: string, iri: string) => void;

  let accEl: HTMLElement | null = null;
  /** One FilterRows per dimension, so focusRow can be aimed at the right one. */
  let rows: Record<string, FilterRows | null> = {};

  /** Matches the grid-template-rows transition in styles/filters.css. Move the
      two together. */
  const EXPAND_MS = 240;

  /** Moves focus to a dimension's header — where the caret goes when an entry
      closes. The [data-head] lookup belongs to whoever renders the attribute,
      which is this component. */
  export function focusHeader(id: string): void {
    accEl?.querySelector<HTMLElement>(`[data-head="${id}"]`)?.focus({ preventScroll: true });
  }

  /**
   * Focuses a tag's row and brings it into view — the last step of the detail
   * pane's "filter by this tag".
   *
   * The two halves are deliberately separated in time. Focus needs no layout and
   * goes first, so nothing is ever focus-less and the row is announced at once;
   * the scroll has to wait, because a section that has only just been told to
   * open is still at zero height and centring a row inside it would aim at the
   * wrong place. preventScroll on the focus is what stops the browser doing that
   * scroll itself and leaving the panel's clip box permanently offset.
   */
  export async function focusRow(dim: string, iri: string): Promise<void> {
    /* After the flush the section's panel is no longer inert, so its rows can
       take focus at all. */
    await tick();
    const pane = rows[dim];
    if (!pane) return;
    pane.focusRow(iri);
    afterExpanded(dim, () => pane.revealRow(iri));
  }

  /**
   * Runs `cb` once a section is at its full height.
   *
   * The height test is a measurement rather than a flag from the caller, and it
   * is right either way it lands: a panel that is already open reports its
   * content's height and the callback runs now, and one that has just been told
   * to open reports the zero the transition is starting from, so the callback
   * waits. If a browser ever answers "full" for a panel mid-transition, then
   * layout really is full and scrolling to a row in it is correct anyway.
   *
   * transitionend makes the wait prompt and the timer makes it correct: rename
   * the animated property and the listener stops firing while the fallback still
   * runs, rather than the callback going silently dead the way TabStrip's
   * `propertyName === 'width'` test once did.
   */
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

<!-- A group rather than a bare stack of five: naming the set is what tells a
     screen-reader user these disclosures belong to one control, which the
     tablist's own label used to do. -->
<div class="acc" bind:this={accEl} role="group" aria-label={t.filterDimensions}>
  {#each dims as dim (dim.id)}
    {@const open = openDim === dim.id}
    {@const n = sel[dim.id]?.size ?? 0}
    <div class="asec" class:open>
      <!-- The heading is here for AT's heading list, and it is the level below
           the widget's own sr <h1>. The detail pane's <h2> never competes with
           these: .pane-filters is display:none while that pane shows. -->
      <h2>
        <button
          type="button"
          class="ahbtn"
          data-head={dim.id}
          id={'acch-' + dim.id}
          aria-expanded={open}
          aria-controls={'accp-' + dim.id}
          aria-label={n ? fmt(t.dimSelected, { label: dim.label, n }) : dim.label}
          on:click={() => onToggleDim(dim.id)}
        >
          <!-- Always rendered, icon or not, so every header keeps the same four
               columns and the labels of sections with and without an icon still
               line up. It sits in the column the rows put their checkbox in —
               see the grid in styles/filters.css. -->
          <span class="dico"
            >{#if dim.icon}<Icon name={dim.icon} size={16} />{/if}</span
          >
          <span class="lb">{dim.label}</span>
          <!-- Kept at opacity 0 so the header cannot change width; hidden from AT
               because every header then announced a "0", and the count is in the
               header's name. -->
          <span class="cnt" class:off={n === 0} aria-hidden="true">{n || '0'}</span>
          <span class="chev"><Icon name="chevronUp" size={16} /></span>
        </button>
      </h2>
      <!-- inert rather than hidden: hidden would win over the grid row and there
           would be nothing to animate, while inert takes the closed rows out of
           the tab order and the a11y tree without touching layout at all. -->
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
