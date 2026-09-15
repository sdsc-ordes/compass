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
