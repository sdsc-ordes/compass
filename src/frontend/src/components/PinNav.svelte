<script lang="ts">
  import type { Proj } from '../lib/types';

  export let projs: Proj[] = [];
  export let onFocus: (p: Proj) => void;
  export let onBlur: (p: Proj) => void;
  export let onSelect: (p: Proj) => void;
</script>

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
