<script lang="ts">
  import Icon from './Icon.svelte';
  import type { IconName } from '../lib/icons';

  export let id: string;
  export let label: string;
  // Two choices: the sliding thumb in chrome.css covers half the control.
  export let choices: { label: string; icon?: IconName; pressed: boolean; pick: () => void }[];

  $: active = choices.findIndex((c) => c.pressed);
</script>

<div class="setrow">
  <span class="setlbl" {id}>{label}</span>
  <div class="seg" data-active={String(active)} role="group" aria-labelledby={id}>
    <span class="segthumb"></span>
    {#each choices as choice}
      <button type="button" aria-pressed={choice.pressed} on:click={choice.pick}
        >{#if choice.icon}<Icon name={choice.icon} />{/if}{choice.label}</button
      >
    {/each}
  </div>
</div>
