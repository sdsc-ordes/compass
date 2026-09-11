<script lang="ts">
  /**
   * Entry detail — replaces the filters in the sidebar while one is selected.
   *
   * Always in the DOM: `aside.filters.detail` is what reveals it.
   */
  import { geoOrthographic, geoPath, geoGraticule } from 'd3-geo';
  import Icon from './Icon.svelte';
  import { loadAtlas } from '../lib/basemap';
  import { fmt, type Strings } from '../lib/i18n';
  import type { Proj, Tag } from '../lib/types';

  export let t: Strings;
  export let entry: Proj | null = null;
  /** Dimension ids in the order the filter accordion stacks them. */
  export let dimIds: string[] = [];
  export let onBack: () => void;
  export let onClose: () => void;
  export let onFilterByTag: (dim: string, iri: string) => void;
  /** The <h2> the pane focuses when it opens — see CompassMap. */
  export let titleEl: HTMLHeadingElement | null = null;

  const THUMB = 128;

  /** A globe turned so the entry faces the viewer. One path string per layer. */
  $: thumb = entry ? buildThumb(entry) : null;

  function buildThumb(p: Proj) {
    const atlas = loadAtlas();
    const pr = geoOrthographic()
      .rotate([-p.c[0], -p.c[1]])
      .fitExtent(
        [
          [3, 3],
          [THUMB - 3, THUMB - 3],
        ],
        { type: 'Sphere' },
      );
    const pth = geoPath(pr);
    const xy = pr(p.c) ?? [THUMB / 2, THUMB / 2];
    return {
      sea: pth({ type: 'Sphere' }) ?? '',
      grat: pth(geoGraticule().step([30, 30])()) ?? '',
      land: pth(atlas.land) ?? '',
      rim: pth({ type: 'Sphere' }) ?? '',
      x: xy[0],
      y: xy[1],
    };
  }

  /** Every dimension's tags, flattened in tab order — what the .ptags render. */
  $: tags = entry
    ? dimIds.flatMap((id) => (entry?.tags[id] ?? []).map((tag: Tag) => ({ dim: id, tag })))
    : [];

  /** "Read more": the entity's filtered stories index, as the API built it.
      Empty -- and the link hidden -- when the entity carries no tag id. */
  $: storiesHref = entry?.storiesUrl ?? '';
</script>

<div class="pane-detail">
  <div class="detailhead">
    <button class="back" type="button" on:click={onBack}>&lsaquo; {t.backToFilters}</button>
    <button class="xclose" type="button" aria-label={t.closeEntry} on:click={onClose}
      >&times;</button
    >
  </div>

  <svg class="thumb" viewBox="0 0 {THUMB} {THUMB}" aria-hidden="true">
    {#if thumb}
      <path class="th-sea" d={thumb.sea} />
      <path class="th-grat" d={thumb.grat} />
      <path class="th-land" d={thumb.land} />
      <path class="th-rim" d={thumb.rim} />
      <circle class="th-halo" cx={thumb.x} cy={thumb.y} r="7.5" />
      <circle class="th-dot" cx={thumb.x} cy={thumb.y} r="3.6" />
    {/if}
  </svg>

  <!-- The type, and the way into the entityType filter.
       It was a plain kicker while nothing filtered by type; now that something
       does, it behaves like the control it is. Styled as the .ptags below
       inverted — the same pill, filled instead of outlined — so it reads as the
       same family while being unmistakably not one of them: what this entry IS,
       against what it carries. Kept out of the .ptags row for the same reason.

       Still a plain kicker when the feature carried no typeIri, since there
       would be nothing to filter by. The words on the button come first and the
       action follows in an .sr span, so the accessible name starts with the
       visible label (WCAG 2.5.3). -->
  {#if entry?.typeIri}
    <button
      class="etag"
      type="button"
      on:click={() => entry && onFilterByTag('entityType', entry.typeIri)}
      >{entry.entity}<span class="sr"> &mdash; {t.filterByType}</span></button
    >
  {:else}
    <p class="etag etag-flat">{entry?.entity ?? ''}</p>
  {/if}
  <h2 bind:this={titleEl} tabindex="-1">{entry?.title ?? ''}</h2>
  <p class="where">{entry?.where ?? ''}</p>
  <p class="txt">{entry?.txt ?? ''}</p>

  <div class="ptags">
    {#each tags as { dim, tag } (dim + tag.iri)}
      <!-- A tag is the way back into the filters, so it behaves like the control it is. -->
      <button
        class="ptag"
        type="button"
        aria-label={fmt(t.filterByTag, { label: tag.label })}
        on:click={() => onFilterByTag(dim, tag.iri)}>{tag.label}</button
      >
    {/each}
  </div>

  {#if storiesHref}
    <!-- Two panels link to stories, so the name says whose — leading with the
         words on the button (WCAG 2.5.3), and naming the new tab (WCAG 3.2.5). -->
    <a
      class="storiesbtn"
      href={storiesHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${fmt(t.relatedStoriesFrom, { title: entry?.title ?? '' })} ${t.newTab}`}
      ><span class="sb-lb">{t.relatedStories}</span><Icon name="extLink" /></a
    >
  {/if}

  <!-- The entity's own site: not in the design, but schema:url is real data and
       the old sidebar linked it. -->
  {#if entry?.url}
    <a
      class="storiesbtn ghost"
      href={entry.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${fmt(t.websiteOf, { title: entry.title })} ${t.newTab}`}
      ><span class="sb-lb">{t.website}</span><Icon name="extLink" /></a
    >
  {/if}
</div>
