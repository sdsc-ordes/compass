/**
 * In-browser SPARQL over the bundled ontology.
 *
 * Rows are flattened to plain objects: one per binding, unbound variables
 * omitted, every value stringified.
 */
// The web build: its default export is the async wasm `init`, which must run
// before `new Store()`. The package's default types (node.d.ts) omit it.
import init, { Store } from 'oxigraph/web.js';

import compassTtl from '../../../ontology/compass.ttl?raw';
import vocabTtl from '../../../ontology/vocab.ttl?raw';
import shapesTtl from '../../../ontology/shapes.ttl?raw';

export type Row = Record<string, string>;

let store: Store | null = null;

/** Initialise the WASM engine and load the three Turtle files (idempotent). */
export async function initStore(): Promise<void> {
  if (store) return;
  // No argument: web.js resolves its own wasm URL, which Vite inlines. Passing
  // one here inlines the same binary a second time.
  await init();
  const s = new Store();
  const opts = { format: 'text/turtle', base_iri: 'http://example.org/ocean-org/' };
  s.load(compassTtl, opts);
  s.load(vocabTtl, opts);
  s.load(shapesTtl, opts);
  store = s;
}

export function query(sparql: string): Row[] {
  if (!store) throw new Error('oxigraph store not initialised — call initStore() first');
  const bindings = store.query(sparql) as Array<Map<string, { value: string; termType: string }>>;
  const rows: Row[] = [];
  for (const binding of bindings) {
    const item: Row = {};
    for (const [key, term] of binding) {
      if (term == null) continue; // unbound → omit (SPARQL semantics)
      item[key] = term.termType === 'BlankNode' ? `_:${term.value}` : term.value;
    }
    rows.push(item);
  }
  return rows;
}
