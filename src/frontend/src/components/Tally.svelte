<script lang="ts">
  /**
   * What the selection amounts to, and the two things to do about it.
   *
   * One band, not two. The story count and the result count were separate blocks
   * for a while — StoriesBlock above, Tally below — and on the same --sea ground,
   * 10px apart, they read as one region split by a seam rather than as two
   * quantities. Merging them is what the design prototype does: one number leads
   * at 40px, the other is a quiet line under it, and the actions sit along the
   * bottom edge.
   *
   * The stories lead. The map beside this panel already shows the results, so the
   * number worth setting in 40px is the one nothing else on screen says, and
   * going to read is the errand worth inviting. The result count is the line that
   * qualifies it — how much of the map those stories are drawn from.
   *
   * Three states, because the two counts do not arrive together:
   *
   *   counted   stories mapped to real tag ids: the number leads, and the link
   *             goes to the filtered index
   *   prompt    the API answered but no story matched — no filters yet, or none
   *             the story index knows — so the block says what to do and offers
   *             the unfiltered index anyway
   *   quiet     no backend answered at all, so there is no story count and no URL
   *             to offer; the band is the result count and the reset
   *
   * The block used to be a single anchor, which is why it was one thing to press.
   * It cannot be now: the reset is a button, and a button inside a link is not a
   * control the browser can resolve. So the anchor is the link alone, and it
   * carries its own accessible name.
   */
  import Icon from './Icon.svelte';
  import { fmt, plural, type Strings } from '../lib/i18n';
  import type { StoryCount } from '../lib/stories';

  export let t: Strings;
  export let resultCount = 0;
  /** Null whenever no backend answered: there is then no count and no URL. */
  export let storyCount: StoryCount | null = null;
  export let anyFilters = false;
  export let statusText = '';
  export let onReset: () => void;
  /** Bound out for the mobile dock: this band's height plus the handle's is how
      much map the docked panel covers, so lib/sheet.ts measures it. Nothing else
      reaches in here. */
  export let tallyEl: HTMLElement | null = null;

  $: counted = storyCount && storyCount.count > 0 && storyCount.url ? storyCount : null;
  $: resultLine = fmt(plural(resultCount, t.tallyResultsOne, t.tallyResults), {
    n: resultCount,
  });
</script>

<!-- The one live region: a filter change rewrites this band, the empty plate,
     every section count, the type pills and every row count at once, so it says
     all of it in one sentence. The visual numbers are aria-hidden because this
     repeats them. -->
<p class="sr" role="status" aria-live="polite">{statusText}</p>

<div class="tally" class:lead={!!counted} bind:this={tallyEl}>
  {#if counted}
    <p class="big" aria-hidden="true">{counted.count}</p>
    <p class="lbl" aria-hidden="true">
      {plural(counted.count, t.storiesCaptionOne, t.storiesCaption)}
    </p>
  {:else if storyCount}
    <p class="lbl ask" aria-hidden="true">{t.storiesPrompt}</p>
  {/if}
  <p class="sub" aria-hidden="true">{resultLine}</p>

  <div class="acts">
    {#if storyCount}
      <!-- The accessible name leads with the words a user would say (WCAG 2.5.3)
           and names the new tab (WCAG 3.2.5 / G201). The count rides in the name
           rather than the visible label, which is the same two words in both
           states so the control does not move under the pointer. -->
      <a
        class="storiesgo"
        href={storyCount.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={counted
          ? `${t.relatedStories} — ${counted.count} ${plural(counted.count, t.storiesCaptionOne, t.storiesCaption)} ${t.newTab}`
          : `${t.allStories} — ${t.storiesPrompt} ${t.newTab}`}
      >
        <span class="sb-lb">{counted ? t.relatedStories : t.allStories}</span>
        <Icon name="extLink" />
      </a>
    {/if}
    <button
      class="reset"
      class:off={!anyFilters}
      type="button"
      disabled={!anyFilters}
      on:click={onReset}>{t.resetFiltersLong}</button
    >
  </div>
</div>
