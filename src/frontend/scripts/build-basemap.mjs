// Builds src/map/basemap.json — the land and border geometry the map draws its
// own background from, so no tile service is contacted at runtime.
//
//   node scripts/build-basemap.mjs   (needs network)
//
// Natural Earth 110m is the right resolution here: the map frames at zoom 6 or
// below, and every extra vertex ships inside the single-file widget bundle.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const SOURCES = {
  land: `${NE}/ne_110m_land.geojson`,
  borders: `${NE}/ne_110m_admin_0_boundary_lines_land.geojson`,
  // Lakes and rivers cost ~25 KB together and are what stop the land reading
  // as a blank shape. Depth comes from the GEBCO tiles `just tiles` renders,
  // not from here: Natural Earth's coarsest band is 600 KB even simplified,
  // far too much to ship inside the widget bundle.
  lakes: `${NE}/ne_110m_lakes.geojson`,
  rivers: `${NE}/ne_110m_rivers_lake_centerlines.geojson`,
};

// Coordinates are clamped to this many decimals: ~10 m at the equator, far
// finer than a 110m dataset resolves, and it roughly halves the file.
const PRECISION = 3;

const round = (n) => Math.round(n * 10 ** PRECISION) / 10 ** PRECISION;

function trim(coords) {
  return typeof coords[0] === 'number' ? coords.map(round) : coords.map(trim);
}

async function load(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed HTTP ${res.status} (${url})`);
  return res.json();
}

async function main() {
  const out = {};
  for (const [name, url] of Object.entries(SOURCES)) {
    const fc = await load(url);
    out[name] = {
      type: 'FeatureCollection',
      // Properties are dropped: nothing styles or labels off them, and the
      // names they carry are English-only.
      features: fc.features.map((f) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: f.geometry.type, coordinates: trim(f.geometry.coordinates) },
      })),
    };
    console.log(`${name}: ${out[name].features.length} features`);
  }

  const path = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'src',
    'map',
    'basemap.json',
  );
  writeFileSync(path, JSON.stringify(out));
  console.log(`wrote ${path}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
