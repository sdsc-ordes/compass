<script lang="ts">
  import { geoOrthographic, geoPath, geoGraticule } from 'd3-geo';
  import Icon from './Icon.svelte';
  import { atlas, type Atlas } from '../lib/basemap';
  import { fmt, type Strings } from '../lib/i18n';
  import type { Entry, Tag } from '../lib/types';
  import { TYPE_DIM, type Dim } from '../lib/schema';

  export let t: Strings;
  export let entry: Entry | null = null;
  export let dims: Dim[] = [];
  export let onBack: () => void;
  export let onClose: () => void;
  export let onFilterByTag: (dim: string, iri: string) => void;
  export let titleEl: HTMLHeadingElement | null = null;

  const THUMB_SIZE = 128;
  const GRATICULE = geoGraticule().step([30, 30])();

  $: thumb = entry && $atlas ? buildThumb(entry, $atlas) : null;

  function buildThumb(p: Entry, a: Atlas) {
    const projection = geoOrthographic()
      .rotate([-p.lonLat[0], -p.lonLat[1]])
      .fitExtent(
        [
          [3, 3],
          [THUMB_SIZE - 3, THUMB_SIZE - 3],
        ],
        { type: 'Sphere' },
      );
    const path = geoPath(projection);
    const [x, y] = projection(p.lonLat) ?? [THUMB_SIZE / 2, THUMB_SIZE / 2];
    return {
      sphere: path({ type: 'Sphere' }) ?? '',
      grat: path(GRATICULE) ?? '',
      land: path(a.land) ?? '',
      x,
      y,
    };
  }

  // Long name first, then the display name (often an acronym) in brackets when they differ.
  $: heading =
    entry && entry.longName && entry.longName !== entry.title
      ? `${entry.longName} (${entry.title})`
      : (entry?.title ?? '');

  $: groups = entry ? tagGroups(entry, dims) : [];

  // In sidebar order; dims the sidebar does not list come last.
  function tagGroups(p: Entry, ds: Dim[]): { dim: string; label: string; tags: Tag[] }[] {
    const known = ds.map((d) => d.id);
    const rest = Object.keys(p.tags).filter((id) => !known.includes(id));
    return [...ds, ...rest.map((id) => ({ id, label: id }))]
      .map((d) => ({ dim: d.id, label: d.label, tags: p.tags[d.id] ?? [] }))
      .filter((g) => g.tags.length > 0);
  }
</script>

<div class="pane-detail">
  <div class="detailhead">
    <button class="back" type="button" on:click={onBack}>&lsaquo; {t.backToFilters}</button>
    <button class="xclose" type="button" aria-label={t.closeEntry} on:click={onClose}
      >&times;</button
    >
  </div>

  <svg class="thumb" viewBox="0 0 {THUMB_SIZE} {THUMB_SIZE}" aria-hidden="true">
    {#if thumb}
      <path class="th-sea" d={thumb.sphere} />
      <path class="th-grat" d={thumb.grat} />
      <path class="th-land" d={thumb.land} />
      <path class="th-rim" d={thumb.sphere} />
      <circle class="th-halo" cx={thumb.x} cy={thumb.y} r="7.5" />
      <circle class="th-dot" cx={thumb.x} cy={thumb.y} r="3.6" />
    {/if}
  </svg>

  {#if entry?.typeIri}
    <button
      class="etag"
      type="button"
      on:click={() => entry && onFilterByTag(TYPE_DIM, entry.typeIri)}
      >{entry.typeLabel}<span class="sr"> &mdash; {t.filterByType}</span></button
    >
  {:else}
    <p class="etag etag-flat">{entry?.typeLabel ?? ''}</p>
  {/if}
  <h2 bind:this={titleEl} tabindex="-1">{heading}</h2>
  <p class="where">{entry?.where ?? ''}</p>
  <p class="txt">{entry?.description ?? ''}</p>

  {#if entry?.storiesUrl}
    <div class="storiescall">
      <a
        class="storiesbtn"
        href={entry.storiesUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${fmt(t.relatedStoriesFrom, { title: entry.title })} ${t.newTab}`}
        ><span class="sb-lb">{t.relatedStories}</span><Icon name="extLink" /></a
      >
    </div>
  {/if}

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
