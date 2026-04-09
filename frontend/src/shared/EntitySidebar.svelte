<script lang="ts">
  import { X, ExternalLink } from 'lucide-svelte';
  import { i18n, type Lang } from './i18n';

  // Raw MapLibre feature properties (nested objects arrive as JSON strings)
  export let entity: any;
  export let lang: Lang = 'en';
  export let onClose: () => void = () => {};

  $: t = i18n[lang] || i18n.en;

  // MapLibre stringifies nested objects — parse them back
  $: focusAreas = (() => { try { return JSON.parse(entity?.focusAreas || '[]'); } catch { return []; } })();
  $: region     = (() => { try { return JSON.parse(entity?.primaryOceanRegion || 'null'); } catch { return null; } })();
  $: funding    = (() => { try { return JSON.parse(entity?.fundingSource || 'null'); } catch { return null; } })();
  $: access     = (() => { try { return JSON.parse(entity?.accessType || 'null'); } catch { return null; } })();
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

    {#if entity?.founded}
      <p class="founded">Established {entity.founded}</p>
    {/if}

    {#if entity?.country}
      <p class="country">{entity.country}</p>
    {/if}

    {#if focusAreas.length > 0 || region || funding || access}
      <div class="props-section">
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

    <div class="actions">
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
  .chip-funding { background: #fef3c7; color: #b45309; }
  .chip-access  { background: #dcfce7; color: #15803d; }

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
