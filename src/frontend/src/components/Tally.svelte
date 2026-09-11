<script lang="ts">
  /**
   * What the filters leave standing, and the reset.
   *
   * It used to carry the story count too — a 40px result number with a 15px
   * story line beneath it, both ending "in this selection" — which read as one
   * quantity and its breakdown. The stories have their own block above this one
   * now (components/StoriesBlock.svelte), and the emphasis went with them: this
   * is one small line, because the map beside it already shows the result, and
   * going to read is the errand worth inviting.
   */
  import { plural, type Strings } from '../lib/i18n';

  export let t: Strings;
  export let resultCount = 0;
  export let anyFilters = false;
  export let statusText = '';
  export let onReset: () => void;
  /** Bound out for the mobile dock: this block plus the handle is how tall the
      panel's shortest stop is, so lib/sheet.ts measures it. Nothing else reaches
      in here. */
  export let tallyEl: HTMLElement | null = null;
</script>

<!-- The one live region: a filter change rewrites the tally, the empty plate,
     four section counts, the type pills and every row count at once, so it says
     all of it in one
     sentence. The visual numbers are aria-hidden because this repeats them. -->
<p class="sr" role="status" aria-live="polite">{statusText}</p>

<div class="tally" bind:this={tallyEl}>
  <p class="rescount" aria-hidden="true">
    <b>{resultCount}</b>
    {plural(resultCount, t.tallyCaptionOne, t.tallyCaption)}
  </p>
  <div class="resetwrap">
    <button
      class="reset"
      class:off={!anyFilters}
      type="button"
      disabled={!anyFilters}
      on:click={onReset}>{t.resetFiltersLong}</button
    >
  </div>
</div>
