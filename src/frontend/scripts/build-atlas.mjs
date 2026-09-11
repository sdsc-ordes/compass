// Builds src/atlas.json — the Natural Earth 1:50m country topology the
// d3 stage draws its basemap from (land outline, country border mesh and the
// centroids behind the country labels).
//
//   node scripts/build-atlas.mjs   (needs network)
//
// The prototype fetched this from a CDN at runtime. The widget ships as one
// self-contained file with no network calls, so it is committed instead. The
// topology is ~750 KB of JSON next to a bundle that already inlines the oxigraph
// wasm, which is proportionally cheap; stage/basemap.ts turns it into geometry
// at boot.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ATLAS = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';

const res = await fetch(ATLAS);
if (!res.ok) throw new Error(`fetch failed HTTP ${res.status} (${ATLAS})`);
const topo = await res.json();

if (!topo?.objects?.countries) throw new Error('no objects.countries in the topology');

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'atlas.json');
writeFileSync(out, JSON.stringify(topo));
console.log(`wrote ${topo.objects.countries.geometries.length} countries to ${out}`);
