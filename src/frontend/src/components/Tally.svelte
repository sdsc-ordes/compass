<script lang="ts">
  /**
   * What there is to read, and how much of the map it comes from.
   *
   * The count sits in a box and the way out sits under it, as a link with an
   * orange rule rather than as a filled slab. The slab was the design
   * prototype's utility button and it carried the errand too hard: a solid
   * --astronaut bar is the loudest thing a 420px panel can hold, and it was
   * shouting an invitation. A large number is a quieter way to be the first
   * thing seen — it states a quantity and lets the link beside it be the
   * action.
   *
   * The rule under the link is --sienna, the one place this widget spends that
   * accent on an action. Everywhere else --cerulean underlines a text action
   * (.reset, .storiesbtn), so the orange is what separates the one link that
   * leaves the widget from the several that do not. Worth knowing: --sienna is
   * the design system's donate colour and already means "selected pin" and
   * "error" on the stage, so this is a third meaning for it inside the widget.
   *
   * The result count is the line under the box: smaller, quieter, and saying the
   * one thing the box does not.
   *
   * And it waits visibly, which the rest of the panel does not have to. The map's
   * own queries answer in 5-25ms; this one is the backend proxying a live call
   * out to the stories provider, measured at 1.6-2.8s, with 300ms of debounce in
   * front of it. Two waits follow from that:
   *
   *   waiting   nothing on screen yet, so a dolphin crosses the box and leaps
   *             once on the way through. The scene is the height the number and
   *             caption would take, so the box still arrives at roughly its
   *             final height and the filters below do not jump when the count
   *             lands
   *   settling  a count is already up and a new one is coming. It stays, because
   *             an answer one click old still reads better than a blank, but it
   *             dims and breathes so it is not read as current
   *
   * Three states, because the two counts do not arrive together:
   *
   *   counted   stories mapped to real tag ids: the number leads and the link
   *             goes to the filtered index
   *   prompt    the API answered but nothing matched — no filters yet, or none
   *             the story index knows — so there is no number and the link
   *             offers the whole index
   *   quiet     no backend answered, so there is no box at all; the result line
   *             stands on its own
   */
  import Icon from './Icon.svelte';
  import { fmt, plural, type Strings } from '../lib/i18n';
  import type { StoryCount } from '../lib/stories';

  export let t: Strings;
  export let resultCount = 0;
  /** Null whenever no backend answered: there is then no count and no URL. */
  export let storyCount: StoryCount | null = null;
  /** True while a count is debouncing or in flight — see the box's two waits. */
  export let storiesPending = false;
  export let statusText = '';
  /** Bound out for the mobile dock: this block's height plus the handle's is how
      much map the docked panel covers, so lib/sheet.ts measures it. Nothing else
      reaches in here. */
  export let tallyEl: HTMLElement | null = null;

  $: counted = storyCount && storyCount.count > 0 && storyCount.url ? storyCount : null;
  $: resultLine = fmt(plural(resultCount, t.tallyResultsOne, t.tallyResults), {
    n: resultCount,
  });
</script>

<!-- The one live region: a filter change rewrites this block, the empty plate,
     every section count, the type pills and every row count at once, so it says
     all of it in one sentence. The visible numbers are aria-hidden because this
     repeats them. -->
<p class="sr" role="status" aria-live="polite">{statusText}</p>

<div class="tallyband" bind:this={tallyEl}>
  {#if !storyCount && storiesPending}
    <!-- The first wait, with nothing to keep on screen. The scene is the height
         the number and its caption would take, so the box arrives at roughly its
         final height and the filters below it do not jump when the count lands.
         No link: there is no URL yet, and a dead control is worse than none.

         The dolphin is drawn here rather than in lib/icons.ts: that set is the
         stage chrome's, 24x24 and stroked, and this is a filled silhouette on
         its own grid that no control uses. -->
    <div class="tallybox waiting" aria-hidden="true">
      <div class="leap">
        <svg class="dolphin" viewBox="0 0 48 32" width="39" height="26">
          <path
            d="M47 13.8 C45.4 12.9 43.6 12.4 42 12.2 C41 10.2 40 8.8 38 8.2
               C34.6 6.4 31 5.7 28 6 C26.4 4.8 24.8 3.6 23 2.8
               C23.8 4.4 24.4 5.8 24.6 7.2 C18.8 8.4 12.6 10.6 7.4 13.6
               C5.6 12 3.4 10.6 1.1 9.6 C2.6 12 3.8 14 4.4 16.2
               C3.6 18.4 2.2 20.4 0.6 22.2 C3.4 21.4 6 20 8.6 18
               C12 16.8 16 16.2 20 16 C19 18.4 18.6 21 18.8 23.4
               C21 20.8 23.4 18.6 26.2 17 C31 16.2 36 15.4 41 14.9
               C43 14.7 45.4 14.4 47 13.8 Z"
          />
        </svg>
        <span class="sea"></span>
      </div>
    </div>
  {:else if storyCount}
    <div class="tallybox" class:lead={!!counted} class:settling={storiesPending}>
      {#if counted}
        <p class="big" aria-hidden="true">{counted.count}</p>
        <p class="lbl" aria-hidden="true">
          {plural(counted.count, t.storiesCaptionOne, t.storiesCaption)}
        </p>
      {:else}
        <p class="lbl ask" aria-hidden="true">{t.storiesPrompt}</p>
      {/if}
      <!-- The visible words already name the errand, so there is no aria-label
           to replace them (WCAG 2.5.3); only the new tab needs saying, and it
           goes in a span for the same reason. -->
      <a class="storiesgo" href={storyCount.url} target="_blank" rel="noopener noreferrer">
        <span class="sb-lb"
          >{counted
            ? plural(counted.count, t.storiesReadOne, t.storiesRead)
            : t.allStories}</span
        >
        <Icon name="extLink" />
        <span class="sr"> {t.newTab}</span>
      </a>
    </div>
  {/if}
  <p class="sub" aria-hidden="true">{resultLine}</p>
</div>
