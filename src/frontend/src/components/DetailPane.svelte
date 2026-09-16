<script lang="ts">
  import { geoOrthographic, geoPath, geoGraticule } from 'd3-geo';
  import Icon from './Icon.svelte';
  import { loadAtlas } from '../lib/basemap';
  import { fmt, type Strings } from '../lib/i18n';
  import type { Proj, Tag } from '../lib/types';
  import type { Dim } from '../lib/schema';

  export let t: Strings;
  export let entry: Proj | null = null;
  export let dims: Dim[] = [];
  export let onBack: () => void;
  export let onClose: () => void;
  export let onFilterByTag: (dim: string, iri: string) => void;
  export let titleEl: HTMLHeadingElement | null = null;

  const THUMB = 128;

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

  $: groups = entry ? tagGroups(entry, dims) : [];

  // the groups read in the sidebar's section order, so the panel and the filter
  // list name the schemes in the same sequence; a dim the sidebar does not list
  // still gets a group, last, rather than being dropped from the panel
  function tagGroups(p: Proj, ds: Dim[]): { dim: string; label: string; tags: Tag[] }[] {
    const known = ds.map((d) => d.id);
    const rest = Object.keys(p.tags).filter((id) => !known.includes(id));
    return [...ds, ...rest.map((id) => ({ id, label: id }))]
      .map((d) => ({ dim: d.id, label: d.label, tags: p.tags[d.id] ?? [] }))
      .filter((g) => g.tags.length > 0);
  }

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
    {#each groups as { dim, label, tags } (dim)}
      <div class="ptaggroup">
        <h3 class="ptaglabel">{label}</h3>
        <div class="ptagrow">
          {#each tags as tag (tag.iri)}
            <button
              class="ptag"
              type="button"
              aria-label={fmt(t.filterByTag, { label: tag.label })}
              on:click={() => onFilterByTag(dim, tag.iri)}>{tag.label}</button
            >
          {/each}
        </div>
      </div>
    {/each}
  </div>

  {#if storiesHref}
    <a
      class="storiesbtn"
      href={storiesHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${fmt(t.relatedStoriesFrom, { title: entry?.title ?? '' })} ${t.newTab}`}
      ><span class="sb-lb">{t.relatedStories}</span><Icon name="extLink" /></a
    >
  {/if}

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
