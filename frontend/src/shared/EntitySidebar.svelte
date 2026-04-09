<script lang="ts">
  import { X, ExternalLink, Heart, Compass } from 'lucide-svelte';
  import { i18n, type Lang } from './i18n';

  // Raw MapLibre feature properties (nested objects arrive as JSON strings)
  export let entity: any;
  export let lang: Lang = 'en';
  export let onClose: () => void = () => {};

  $: t = i18n[lang] || i18n.en;

  // MapLibre stringifies nested objects — parse them back
  $: focusAreas  = (() => { try { return JSON.parse(entity?.focusAreas || '[]'); } catch { return []; } })();
  $: region      = (() => { try { return JSON.parse(entity?.primaryOceanRegion || 'null'); } catch { return null; } })();
  $: funding     = (() => { try { return JSON.parse(entity?.fundingSource || 'null'); } catch { return null; } })();
  $: access      = (() => { try { return JSON.parse(entity?.accessType || 'null'); } catch { return null; } })();
  $: activities  = (() => { try { return JSON.parse(entity?.activities || '[]'); } catch { return []; } })();
  $: projects    = (() => { try { return JSON.parse(entity?.projects || '[]'); } catch { return []; } })();
  $: species     = (() => { try { return JSON.parse(entity?.species || '[]'); } catch { return []; } })();
</script>

<aside class="entity-sidebar">
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

    {#if entity?.founded}
      <p class="founded">Established {entity.founded}</p>
    {/if}

    {#if entity?.country}
      <p class="country">{entity.country}</p>
    {/if}

    {#if entity?.mostRecentUpdate}
      <p class="last-update">{t.propLastUpdate}: {entity.mostRecentUpdate}</p>
    {/if}

    {#if entity?.offersResearchTrips}
      <span class="chip chip-trips"><Compass size={12} /> {t.researchTripsYes}</span>
    {/if}

    {#if focusAreas.length > 0 || region || funding || access || activities.length > 0}
      <div class="props-section">
        {#if activities.length > 0}
          <div class="prop-row">
            <span class="prop-label">{t.propActivities}</span>
            <ul class="activities-list">
              {#each activities as act}
                <li>{act}</li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if focusAreas.length > 0}
          <div class="prop-row">
            <span class="prop-label">{t.propFocusArea}</span>
            <div class="chips">
              {#each focusAreas as fa}
                <a class="chip chip-focus" href={fa.iri} target="_blank" rel="noopener noreferrer">{fa.label}</a>
              {/each}
            </div>
          </div>
        {/if}

        {#if region}
          <div class="prop-row">
            <span class="prop-label">{t.propRegion}</span>
            <a class="chip chip-region" href={region.iri} target="_blank" rel="noopener noreferrer">{region.label}</a>
          </div>
        {/if}

        {#if funding}
          <div class="prop-row">
            <span class="prop-label">{t.propFunding}</span>
            <a class="chip chip-funding" href={funding.iri} target="_blank" rel="noopener noreferrer">{funding.label}</a>
          </div>
        {/if}

        {#if access}
          <div class="prop-row">
            <span class="prop-label">{t.propAccess}</span>
            <a class="chip chip-access" href={access.iri} target="_blank" rel="noopener noreferrer">{access.label}</a>
          </div>
        {/if}
      </div>
    {/if}

    {#if projects.length > 0}
      <div class="props-section">
        <span class="prop-label">{t.propProjects}</span>
        {#each projects as proj}
          <div class="project-card">
            {#if proj.imageUrl}
              <img class="project-img" src={proj.imageUrl} alt={proj.name} />
            {/if}
            <div class="project-info">
              {#if proj.projectUrl}
                <a class="project-link" href={proj.projectUrl} target="_blank" rel="noopener noreferrer">
                  <strong>{proj.name}</strong>
                  <ExternalLink size={11} />
                </a>
              {:else}
                <strong>{proj.name}</strong>
              {/if}
              {#if proj.startDate || proj.endDate}
                <span class="project-dates">{proj.startDate || '?'} — {proj.endDate || '?'}</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if species.length > 0}
      <div class="props-section">
        <div class="prop-row">
          <span class="prop-label">{t.propSpecies}</span>
          <div class="chips">
            {#each species as sp}
              <span class="chip chip-species">{sp}</span>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    <div class="actions">
      {#if entity?.donationUrl}
        <a class="visit-btn donate" href={entity.donationUrl} target="_blank" rel="noopener noreferrer">
          <Heart size={15} />
          {t.propDonation}
        </a>
      {/if}
      {#if entity?.website}
        <a class="visit-btn primary" href={entity.website} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} />
          Website
        </a>
      {/if}
      {#if entity?.id}
        <a class="visit-btn secondary" href={entity.id} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} />
          {t.details}
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
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
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
  .chip-funding  { background: #fef3c7; color: #b45309; }
  .chip-access   { background: #dcfce7; color: #15803d; }
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
</style>
