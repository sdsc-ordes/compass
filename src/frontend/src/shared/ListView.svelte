<script lang="ts">
  import { i18n, type Lang } from './i18n';
  import { chipClass, loadDimensions } from './dimensions';

  export let entities: any[] = [];
  export let lang: Lang = 'en';

  $: t = i18n[lang] || i18n.en;

  $: dimensions = loadDimensions(lang);

  const tagsOf = (entity: any, id: string) => entity.properties[id] || [];
</script>

<div class="list-container">
  <table class="entity-table">
    <thead>
      <tr>
        <th>{t.results} ({entities.length})</th>
        <th>{t.type}</th>
      </tr>
    </thead>
    <tbody>
      {#each entities as entity}
        <tr class="entity-row">
          <td>
            <div class="title-cell">
              <strong>{entity.properties.label}</strong>
              <div class="prop-rows">
                {#each dimensions as dim}
                  {#if tagsOf(entity, dim.id).length > 0}
                    <span class="prop-label">{dim.label}</span>
                    <div class="prop-chips">
                      {#each tagsOf(entity, dim.id) as tag}
                        <span class="chip {chipClass(dim.id)}">{tag.label || tag}</span>
                      {/each}
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          </td>
          <td>
            <a class="type-badge" href={entity.properties.typeIri} target="_blank" rel="noopener noreferrer">{entity.properties.type}</a>
          </td>
        </tr>
      {/each}
      {#if entities.length === 0}
        <tr>
          <td colspan="2" class="empty-state">
            {t.noResults}
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

  th:last-child { width: 1%; white-space: nowrap; }

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

  /* One grid for every row, so labels align and size to the longest. */
  .prop-rows {
    display: grid;
    grid-template-columns: max-content 1fr;
    align-items: baseline;
    gap: 6px 12px;
    margin-top: 6px;
    padding-top: 8px;
    border-top: 1px solid #f1f5f9;
  }

  .prop-label {
    font-size: 0.68rem;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .prop-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .chip {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 100px;
    font-size: 0.72rem;
    font-weight: 500;
  }

  .chip-focus   { background: #dbeafe; color: #1d4ed8; }
  .chip-region  { background: #ccfbf1; color: #0f766e; }
  .chip-tag     { background: #f1f5f9; color: #475569; }
  .chip-species { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

  .type-badge {
    display: inline-block;
    padding: 2px 8px;
    background: #f1f5f9;
    color: #475569;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
  }

  .type-badge:hover {
    background: #e2e8f0;
    color: #334155;
    text-decoration: underline;
  }

  .empty-state {
    text-align: center;
    padding: 4rem 1rem;
    color: #94a3b8;
    font-size: 0.875rem;
  }
</style>
