<script lang="ts">
  import type { Entry } from '../lib/types';

  export let entries: Entry[] = [];
  export let onFocus: (p: Entry) => void;
  export let onBlur: (p: Entry) => void;
  export let onSelect: (p: Entry) => void;
</script>

<div class="pinnav">
  {#each entries as d (d.id)}
    <button
      type="button"
      on:focus={() => onFocus(d)}
      on:blur={() => onBlur(d)}
      on:click={() => onSelect(d)}
      >{d.title} &mdash; {d.typeLabel}{d.where ? ', ' + d.where : ''}</button
    >
  {/each}
</div>
