<script lang="ts">
  /**
   * Off-screen twins of the pins, so Tab reaches every entry the filters leave
   * standing. The canvas and the place names are aria-hidden; this is what a
   * screen reader reads instead.
   */
  import type { Proj } from '../lib/types';

  export let projs: Proj[] = [];
  export let onFocus: (p: Proj) => void;
  /** Stage decides whether the blur still belongs to the pin it is showing. */
  export let onBlur: (p: Proj) => void;
  export let onSelect: (p: Proj) => void;
</script>

<!-- Keyed, so a twin that survives a filter change keeps its node and its focus. -->
<div class="pinnav">
  {#each projs as d (d.id)}
    <button
      type="button"
      on:focus={() => onFocus(d)}
      on:blur={() => onBlur(d)}
      on:click={() => onSelect(d)}>{d.title} — {d.entity}{d.where ? ', ' + d.where : ''}</button
    >
  {/each}
</div>
