<script lang="ts">
  import { i18n, type Lang } from './i18n';
  import { ExternalLink, Info, Heart, Compass } from 'lucide-svelte';

  export let entities: any[] = [];
  export let lang: Lang = 'en';

  $: t = i18n[lang] || i18n.en;
</script>

<div class="list-container">
  <table class="entity-table">
    <thead>
      <tr>
        <th>{t.results} ({entities.length})</th>
        <th>{t.type}</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each entities as entity}
        <tr class="entity-row">
          <td>
            <div class="title-cell">
              <strong>{entity.properties.label}</strong>
              {#if entity.properties.keySentence}
                <span class="key-sentence">{entity.properties.keySentence}</span>
              {/if}
              <div class="badges-row">
                {#if entity.properties.offersResearchTrips}
                  <span class="mini-badge badge-trips"><Compass size={11} /> {t.propResearchTrips}</span>
                {/if}
                {#if entity.properties.donationUrl}
                  <a class="mini-badge badge-donate" href={entity.properties.donationUrl} target="_blank" rel="noopener noreferrer"><Heart size={11} /> {t.propDonation}</a>
                {/if}
              </div>
              <div class="prop-rows">
                {#each ['workArea', 'topic', 'species', 'countryArea'] as dimId}
                  {#if (entity.properties[dimId] || []).length > 0}
                    <div class="prop-row">
                      <span class="prop-label">{dimId}</span>
                      <div class="prop-chips">
                        {#each (entity.properties[dimId] || []) as tag}
                          <span class="chip chip-focus">{tag.label || tag}</span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
              {#if entity.properties.foundingDate}
                <span class="founded-year">Est. {entity.properties.foundingDate}</span>
              {/if}
            </div>
          </td>
          <td>
            <a class="type-badge" href={entity.properties.typeIri} target="_blank" rel="noopener noreferrer">{entity.properties.type}</a>
          </td>
          <td class="actions">
            <button class="action-btn" title={t.details}>
              <Info size={18} />
            </button>
            <button class="action-btn primary" title="Visit">
              <ExternalLink size={18} />
            </button>
          </td>
        </tr>
      {/each}
      {#if entities.length === 0}
        <tr>
          <td colspan="3" class="empty-state">
            No results found for current filters.
          </td>
        </tr>
      {/if}
    </tbody>
  </table>
</div>

<style>
  .list-container {
    width: 100%;
    height: 100%;
    padding: 2rem;
    overflow-y: auto;
    box-sizing: border-box;
    background: #fff;
  }

  .entity-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
  }

  th {
    text-align: left;
    padding: 1rem;
    border-bottom: 2px solid #f1f5f9;
    color: #475569;
    font-size: 0.8125rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .entity-row {
    transition: background 0.2s;
  }

  .entity-row:hover {
    background: #f8fafc;
  }

  td {
    padding: 1.25rem 1rem;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: top;
  }

  .title-cell {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .title-cell strong {
    font-size: 1rem;
    color: #0f172a;
    font-weight: 600;
  }

  .prop-rows {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid #f1f5f9;
  }

  .prop-row {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    margin: 2px 0;
  }

  .prop-label {
    font-size: 0.68rem;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    width: 68px;
    flex-shrink: 0;
    padding-top: 2px;
  }

  .prop-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }

  .chip {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 100px;
    font-size: 0.72rem;
    font-weight: 500;
    text-decoration: none;
    transition: opacity 0.15s;
  }

  .chip:hover {
    opacity: 0.75;
    text-decoration: underline;
  }

  .chip-focus   { background: #dbeafe; color: #1d4ed8; }
  .chip-region  { background: #ccfbf1; color: #0f766e; }
  .chip-funding { background: #fef3c7; color: #b45309; }
  .chip-access  { background: #dcfce7; color: #15803d; }

  .key-sentence {
    font-size: 0.8rem;
    color: #475569;
    font-style: italic;
    line-height: 1.4;
  }

  .badges-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }

  .mini-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 7px;
    border-radius: 100px;
    font-size: 0.68rem;
    font-weight: 600;
    text-decoration: none;
  }
  .badge-trips  { background: #ede9fe; color: #7c3aed; }
  .badge-donate { background: #fce7f3; color: #db2777; }
  .badge-donate:hover { opacity: 0.8; }

  .founded-year {
    font-size: 0.72rem;
    color: #94a3b8;
    margin-top: 2px;
  }

  .type-badge {
    display: inline-block;
    padding: 2px 8px;
    background: #f1f5f9;
    color: #475569;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    text-decoration: none;
  }

  .type-badge:hover {
    background: #e2e8f0;
    color: #334155;
    text-decoration: underline;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  .action-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #e2e8f0;
    background: white;
    border-radius: 8px;
    color: #64748b;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn:hover {
    border-color: #cbd5e1;
    color: #0f172a;
    background: #f8fafc;
  }

  .action-btn.primary {
    background: #0284c7;
    border-color: #0284c7;
    color: white;
  }

  .action-btn.primary:hover {
    background: #0369a1;
  }

  .empty-state {
    text-align: center;
    padding: 4rem 1rem;
    color: #94a3b8;
    font-size: 0.875rem;
  }
</style>
