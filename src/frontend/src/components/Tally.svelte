<script lang="ts">
  import Icon from './Icon.svelte';
  import Spinner from './Spinner.svelte';
  import { fmt, plural, type Strings } from '../lib/i18n';
  import type { StoryCount } from '../lib/stories';

  export let t: Strings;
  export let resultCount = 0;
  export let storyCount: StoryCount | null = null;
  export let storiesPending = false;
  export let statusText = '';
  export let tallyEl: HTMLElement | null = null;

  $: counted = storyCount && storyCount.count > 0 && storyCount.url ? storyCount : null;
  $: resultLine = fmt(plural(resultCount, t.tallyResultsOne, t.tallyResults), {
    n: resultCount,
  });
</script>

<p class="sr" role="status" aria-live="polite">{statusText}</p>

<div class="tallyband" class:asking={!!storyCount && !counted} bind:this={tallyEl}>
  {#if !storyCount && storiesPending}
    <div class="tallybox waiting" aria-hidden="true">
      <Spinner />
    </div>
  {:else if storyCount}
    <div class="tallybox" class:lead={!!counted} class:settling={storiesPending}>
      {#if storiesPending}
        <Spinner />
      {/if}
      {#if counted}
        <p class="big" aria-hidden="true">{counted.count}</p>
        <p class="lbl" aria-hidden="true">
          {plural(counted.count, t.storiesCaptionOne, t.storiesCaption)}
        </p>
      {:else}
        <p class="lbl ask" aria-hidden="true">
          <span class="asklead">{t.storiesPromptLead}</span>
          {t.storiesPrompt}
        </p>
      {/if}
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
