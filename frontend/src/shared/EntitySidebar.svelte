<script lang="ts">
  import { X, ExternalLink, Heart, Compass, BookOpen, MapPin } from 'lucide-svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { i18n, type Lang } from './i18n';

  // Raw MapLibre feature properties (nested objects arrive as JSON strings)
  export let entity: any;
  export let lang: Lang = 'en';
  export let regionCount: number | undefined = undefined;
  export let onFilterByRegion: (iri: string) => void = () => {};
  export let onClose: () => void = () => {};

  $: t = i18n[lang] || i18n.en;

  // MapLibre stringifies nested objects — parse them back
  function safeParseJson<T>(raw: string | undefined, fallback: T): T {
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  }

  // Tag dimensions: each arrives as a JSON-stringified array of {iri, label} objects.
  // The list of tag property IDs matches the SHACL property shapes in shapes.ttl.
  const tagDimensions: {id: string, labelEn: string, labelDe: string, chipClass: string}[] = [
    { id: 'workArea',       labelEn: 'Work Area',       labelDe: 'Arbeitsbereich',    chipClass: 'chip-tag' },
    { id: 'conservation',   labelEn: 'Conservation',    labelDe: 'Schutz',            chipClass: 'chip-tag' },
    { id: 'topic',          labelEn: 'Topic',           labelDe: 'Thema',             chipClass: 'chip-focus' },
    { id: 'pollution',      labelEn: 'Pollution',       labelDe: 'Verschmutzung',     chipClass: 'chip-species' },
    { id: 'species',        labelEn: 'Species',         labelDe: 'Arten',             chipClass: 'chip-species' },
    { id: 'countryArea',    labelEn: 'Country / Area',  labelDe: 'Land / Gebiet',     chipClass: 'chip-region' },
    { id: 'forum',          labelEn: 'Forum',           labelDe: 'Forum',             chipClass: 'chip-focus' },
    { id: 'relatedProject', labelEn: 'Related Project', labelDe: 'Verwandtes Projekt', chipClass: 'chip-focus' },
  ];

  function getTagLabel(dim: typeof tagDimensions[0]): string {
    return lang === 'de' ? dim.labelDe : dim.labelEn;
  }

  // Parse all tag dimensions reactively
  $: parsedTags = tagDimensions.map(dim => ({
    ...dim,
    values: safeParseJson(entity?.[dim.id], [] as any[]),
  })).filter(dim => dim.values.length > 0);
</script>

<aside class="entity-sidebar" transition:fly={{ x: 340, duration: 220, easing: cubicOut }}>
  <div class="sidebar-header">
    <div class="header-meta">
      {#if entity?.typeIri}
        <a href={entity.typeIri} target="_blank" rel="noopener noreferrer" class="type-badge">{entity.type}</a>
      {:else}
        <span class="type-badge">{entity?.type}</span>
      {/if}
    </div>
    <button class="close-btn" on:click={onClose} aria-label="Close panel">
      <X size={18} />
    </button>
  </div>

  <div class="sidebar-body">
    <h2 class="entity-name">{entity?.label}</h2>

    {#if entity?.keySentence}
      <p class="key-sentence">{entity.keySentence}</p>
    {/if}

    {#if entity?.foundingDate}
      <p class="founded">{t.established} {entity.foundingDate}</p>
    {/if}

    {#if entity?.startDate || entity?.endDate}
      <p class="founded">{entity.startDate || '?'} – {entity.endDate || '?'}</p>
    {/if}

    {#if entity?.country}
      <p class="country">{entity.country}</p>
    {/if}

    {#if entity?.offersResearchTrips}
      <span class="chip chip-trips"><Compass size={12} /> {t.researchTripsYes}</span>
    {/if}

    {#if parsedTags.length > 0}
      <div class="props-section">
        {#each parsedTags as dim}
          <div class="prop-row">
            <span class="prop-label">{getTagLabel(dim)}</span>
            <div class="chips">
              {#each dim.values as tag}
                {#if tag.iri}
                  <span class="chip {dim.chipClass}">{tag.label}</span>
                {:else}
                  <span class="chip {dim.chipClass}">{tag}</span>
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="actions">
      {#if entity?.is_region && entity?.id}
        <button class="visit-btn primary" on:click={() => onFilterByRegion(entity.id)}>
          <MapPin size={15} />
          {t.filterByRegion}{#if regionCount}&nbsp;({regionCount}){/if}
        </button>
      {/if}
      {#if entity?.donationUrl}
        <a class="visit-btn donate" href={entity.donationUrl} target="_blank" rel="noopener noreferrer">
          <Heart size={15} />
          {t.propDonation}
        </a>
      {/if}
      {#if entity?.projectUrl}
        <a class="visit-btn primary" href={entity.projectUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} />
          {t.website}
        </a>
      {/if}
      {#if entity?.url && !entity?.projectUrl}
        <a class="visit-btn primary" href={entity.url} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} />
          {t.website}
        </a>
      {/if}
      {#if entity?.id}
        <a class="visit-btn secondary" href={entity.id} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} />
          {t.details}
        </a>
      {/if}
      {#if entity?.wpEntityTagIdEn || entity?.wpEntityTagIdDe}
        {@const tagId = lang === 'de' ? (entity.wpEntityTagIdDe || entity.wpEntityTagIdEn) : (entity.wpEntityTagIdEn || entity.wpEntityTagIdDe)}
        {@const baseUrl = lang === 'de' ? 'https://www.oceancare.org/de/storys-and-news/' : 'https://www.oceancare.org/en/stories-and-news/'}
        <a
          class="visit-btn stories"
          href="{baseUrl}?tag={tagId}"
          target="_blank"
          rel="noopener noreferrer"
        >
          <BookOpen size={15} />
          {t.entityStories}
        </a>
      {/if}
    </div>
  </div>
</aside>

<style>
  .entity-sidebar {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 320px;
    background: white;
    border-left: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    z-index: 50;
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
  }

  /* ── Header ── */
  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 1.125rem;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
    flex-shrink: 0;
  }

  .type-badge {
    display: inline-block;
    font-size: 11px;
    padding: 3px 9px;
    background: #f1f5f9;
    border-radius: 4px;
    color: #475569;
    text-decoration: none;
    font-weight: 500;
    transition: background 0.15s;
  }
  .type-badge:hover { background: #e2e8f0; }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #64748b;
    padding: 4px;
    display: flex;
    align-items: center;
    border-radius: 4px;
    transition: background 0.15s, color 0.15s;
  }
  .close-btn:hover {
    background: #f1f5f9;
    color: #1e293b;
  }

  /* ── Body ── */
  .sidebar-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.25rem 1.125rem;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .entity-name {
    margin: 0 0 0.25rem;
    font-size: 1.2rem;
    font-weight: 700;
    color: #0f172a;
    line-height: 1.35;
  }

  .founded, .country {
    margin: 0 0 0.25rem;
    font-size: 0.8125rem;
    color: #94a3b8;
  }

  /* ── Property rows ── */
  .props-section {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #f1f5f9;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .prop-row {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .prop-label {
    font-size: 10px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .chip {
    display: inline-block;
    padding: 2px 9px;
    border-radius: 100px;
    font-size: 12px;
    font-weight: 500;
    text-decoration: none;
    transition: opacity 0.15s;
  }
  .chip:hover { opacity: 0.75; }

  .chip-focus   { background: #dbeafe; color: #1d4ed8; }
  .chip-region  { background: #ccfbf1; color: #0f766e; }
  .chip-tag     { background: #f1f5f9; color: #475569; }
  .chip-species  { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
  .chip-trips    { background: #ede9fe; color: #7c3aed; display: inline-flex; align-items: center; gap: 4px; margin-top: 0.5rem; }

  .key-sentence {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
    color: #475569;
    line-height: 1.45;
    font-style: italic;
  }

  .last-update {
    margin: 0 0 0.25rem;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .activities-list {
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.8125rem;
    color: #475569;
    line-height: 1.5;
  }
  .activities-list li { margin-bottom: 0.25rem; }

  .project-card {
    display: flex;
    gap: 0.625rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid #f1f5f9;
  }
  .project-card:last-child { border-bottom: none; }
  .project-img {
    width: 56px;
    height: 56px;
    border-radius: 6px;
    object-fit: cover;
    flex-shrink: 0;
  }
  .project-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .project-info strong {
    font-size: 0.8125rem;
    color: #0f172a;
  }
  .project-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8125rem;
    color: #0284c7;
    text-decoration: none;
    font-weight: 600;
    transition: color 0.15s;
  }
  .project-link:hover { color: #0369a1; text-decoration: underline; }
  .project-dates {
    font-size: 0.72rem;
    color: #94a3b8;
  }

  /* ── Action buttons ── */
  .actions {
    margin-top: auto;
    padding-top: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .visit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 9px 14px;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
    transition: background 0.2s, border-color 0.2s;
  }
  .visit-btn.primary {
    background: #0284c7;
    color: white;
  }
  .visit-btn.primary:hover { background: #0369a1; }

  .visit-btn.donate {
    background: #ec4899;
    color: white;
  }
  .visit-btn.donate:hover { background: #db2777; }

  .visit-btn.secondary {
    background: transparent;
    color: #475569;
    border: 1px solid #e2e8f0;
  }
  .visit-btn.secondary:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }
  .visit-btn.stories {
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid #bfdbfe;
  }
  .visit-btn.stories:hover {
    background: #dbeafe;
    border-color: #93c5fd;
  }
</style>
