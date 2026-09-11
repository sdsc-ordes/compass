<script lang="ts">
  /**
   * The panel's primary action, and one line saying what the map is showing.
   *
   * A button, not a link. The design prototype drew this as a filled slab —
   * centred, full width, uppercase, --astronaut turning --cerulean on hover —
   * and it was demoted to a text link on the reasoning that the map, not the
   * stories, is this panel's primary action. That reasoning is overruled:
   * driving people to the stories is the point of the widget, and a link in a
   * panel full of links does not read as the one thing to press.
   *
   * The count rides on the button's face, so the line underneath is free to say
   * one thing — how much of the map this is drawn from — in one small sentence.
   *
   * The reset is no longer here. It is a filter action and it now sits with the
   * filters (see Sidebar), which leaves this block with a single errand.
   *
   * Three states, because the two counts do not arrive together:
   *
   *   counted   stories mapped to real tag ids: the button carries the number
   *             and goes to the filtered index
   *   prompt    the API answered but nothing matched — no filters yet, or none
   *             the story index knows — so the button offers the whole index
   *   quiet     no backend answered, so there is no URL to press; the line
   *             stands on its own
   */
  import { fmt, plural, type Strings } from '../lib/i18n';
  import type { StoryCount } from '../lib/stories';

  export let t: Strings;
  export let resultCount = 0;
  /** Null whenever no backend answered: there is then no count and no URL. */
  export let storyCount: StoryCount | null = null;
  export let statusText = '';
  /** Bound out for the mobile dock: this block's height plus the handle's is how
      much map the docked panel covers, so lib/sheet.ts measures it. Nothing else
      reaches in here. */
  export let tallyEl: HTMLElement | null = null;

  $: counted = storyCount && storyCount.count > 0 && storyCount.url ? storyCount : null;
  $: resultLine = fmt(plural(resultCount, t.tallyResultsOne, t.tallyResults), {
    n: resultCount,
  });
  $: ctaLabel = counted
    ? fmt(plural(counted.count, t.storiesCtaOne, t.storiesCta), { n: counted.count })
    : t.allStories;
</script>

<!-- The one live region: a filter change rewrites this block, the empty plate,
     every section count, the type pills and every row count at once, so it says
     all of it in one sentence. The visible numbers are aria-hidden because this
     repeats them. -->
<p class="sr" role="status" aria-live="polite">{statusText}</p>

<div class="tallyband" bind:this={tallyEl}>
  {#if storyCount}
    <!-- The visible words already name the errand, so there is no aria-label to
         replace them (WCAG 2.5.3); only the new tab needs saying, and it is
         appended in a span rather than folded into a label for the same reason. -->
    <a class="storiescta" href={storyCount.url} target="_blank" rel="noopener noreferrer">
      {ctaLabel}<span class="sr"> {t.newTab}</span>
    </a>
  {/if}
  <p class="sub" aria-hidden="true">{resultLine}</p>
</div>
