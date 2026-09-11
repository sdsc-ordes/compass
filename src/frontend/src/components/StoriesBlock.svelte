<script lang="ts">
  /**
   * The panel's invitation to read — first in the pane, above the result count.
   *
   * The story count and the way to it used to be two things: a small line inside
   * the tally and a loose link underneath it, with the reset button in between.
   * That read as one quantity and its breakdown rather than as two different
   * errands. Here they are a single anchor, so there is one thing to read and
   * one thing to press.
   *
   * Two states, and it is one of them whenever the API answered — a way to the
   * stories is the point, so the block stays put across filter changes:
   *
   *   counted   a selection maps to real tag ids, so the number leads and the
   *             link goes to the filtered index
   *   prompt    no filters yet, or none that the story index knows, so it says
   *             what to do and offers the unfiltered index anyway
   *
   * The prompt is what the dimmed-out link used to be, and it is better: the old
   * one said "0 stories" and could not be pressed, which is a dead control where
   * this is a live one. It matters more than it looks — only 3 of 60 concepts
   * carry a wpTagId, so the prompt is the common state, not the edge case.
   *
   * Both states need a URL, and it is the API's: the widget hard-codes no host,
   * so a deployment that is not OceanCare's links to its own stories. Sidebar
   * draws nothing at all when the API did not answer, which is the one case
   * where there is no URL to offer.
   */
  import Icon from './Icon.svelte';
  import { plural, type Strings } from '../lib/i18n';
  import type { StoryCount } from '../lib/stories';

  export let t: Strings;
  /** Never null here — Sidebar only draws the block once the API has answered. */
  export let storyCount: StoryCount;

  $: counted = storyCount.count > 0 && storyCount.url ? storyCount : null;
  /* The count's own filtered url when there is one, the plain index otherwise;
     both come from the API. */
  $: href = storyCount.url;
  $: label = counted ? t.relatedStories : t.allStories;
</script>

<!-- The accessible name leads with the words a user would say (WCAG 2.5.3) and
     names the new tab (WCAG 3.2.5 / G201). Everything inside is aria-hidden
     because that name already carries it. -->
<a
  class="storiesblock"
  class:prompt={!counted}
  {href}
  target="_blank"
  rel="noopener noreferrer"
  aria-label={counted
    ? `${label} — ${counted.count} ${plural(counted.count, t.storiesCaptionOne, t.storiesCaption)} ${t.newTab}`
    : `${label} — ${t.storiesPrompt} ${t.newTab}`}
>
  {#if counted}
    <span class="stn" aria-hidden="true">{counted.count}</span>
    <span class="stcap" aria-hidden="true"
      >{plural(counted.count, t.storiesCaptionOne, t.storiesCaption)}</span
    >
  {:else}
    <span class="stcap" aria-hidden="true">{t.storiesPrompt}</span>
  {/if}
  <span class="stgo" aria-hidden="true"
    ><span class="sb-lb">{label}</span><Icon name="extLink" /></span
  >
</a>
