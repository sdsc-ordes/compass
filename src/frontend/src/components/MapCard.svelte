<script lang="ts">
  /**
   * One card in two states: the hover preview and the selected entry. Only the 4px
   * accent edge and the close cross differ, so anything added lands in both.
   */
  export let kind: 'projcard' | 'pinprev';
  export let entity = '';
  export let title = '';
  export let where = '';
  /** Positioned imperatively by lib/cards.ts, so Stage keeps the node. */
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
