<script lang="ts">
  export let kind: 'projcard' | 'pinprev';
  export let entity = '';
  export let title = '';
  export let where = '';
  export let el: HTMLDivElement | null = null;
  export let closeLabel = '';
  export let onClose: (() => void) | null = null;
</script>

<div class="mapcard {kind}" bind:this={el} hidden>
  {#if onClose}
    <button
      class="xclose pc-x"
      type="button"
      aria-label={closeLabel}
      on:pointerdown|stopPropagation
      on:click|stopPropagation={onClose}>&times;</button
    >
  {/if}
  <span class="entity">{entity}</span>
  <b>{title}</b>
  <span class="where">{where}</span>
</div>
