<script lang="ts">
  import { i18n, type Lang } from './i18n';
  import { ExternalLink, Info } from 'lucide-svelte';

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
              <p class="description">{entity.properties.description || t.noDescription}</p>
            </div>
          </td>
          <td>
            <span class="type-badge">{entity.properties.type}</span>
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

  .description {
    margin: 0;
    font-size: 0.875rem;
    color: #64748b;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.5;
  }

  .type-badge {
    display: inline-block;
    padding: 2px 8px;
    background: #f1f5f9;
    color: #475569;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
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
