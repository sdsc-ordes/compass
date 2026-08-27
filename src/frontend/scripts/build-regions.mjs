// Builds src/map/regions.json — one boundary polygon per compass:CountryArea
// concept, keyed by `properties.regionKey` (the concept IRI local name).
// Map.svelte joins these onto the geometry-less Country/Area features.
//
//   node scripts/build-regions.mjs   (needs network)
//
// Country shapes come from Natural Earth Admin-0, keyed by the taxonomy sheet's
// iso_codes column; a cell with several codes is dissolved from its members.
// MARINE below is composed from named sea polygons, so it follows coastlines.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import polygonClipping from 'polygon-clipping';

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const COUNTRY_TIERS = [
  `${NE}/ne_110m_admin_0_countries.geojson`,
  `${NE}/ne_50m_admin_0_countries.geojson`,
  `${NE}/ne_10m_admin_0_countries.geojson`,
];
const MARINE_URL = `${NE}/ne_10m_geography_marine_polys.geojson`;

const CONCEPTS = join(
  dirname(fileURLToPath(import.meta.url)), '..', '..', 'ontology', 'taxonomy', 'concepts.tsv',
);

// regionKey -> ISO3 codes, one entry per Country/Area concept that has any.
// Concepts with no code (Arctic, the seas) are covered by MARINE instead.
function countryRegions() {
  const [header, ...lines] = readFileSync(CONCEPTS, 'utf8').trim().split('\n');
  const column = Object.fromEntries(header.split('\t').map((name, i) => [name, i]));
  const regions = [];
  for (const line of lines) {
    const cells = line.split('\t');
    if (cells[column.dimension] !== 'CountryArea') continue;
    const codes = (cells[column.iso_codes] || '').trim().split(/\s+/).filter(Boolean);
    if (codes.length) regions.push([cells[column.id], codes]);
  }
  return regions;
}

const MED_SEAS = ['Mediterranean Sea', 'Alboran Sea', 'Balearic Sea', 'Golfe du Lion',
  'Ligurian Sea', 'Tyrrhenian Sea', 'Adriatic Sea', 'Ionian Sea', 'Aegean Sea', 'Sea of Crete'];
const MED_CUT = 12.5; // Strait of Sicily — divides western and eastern basins

// regionKey -> { seas, clip:[W,S,E,N] }. Sub-seas are dissolved into one shape;
// clip trims to the relevant basin/sector.
const MARINE = {
  Arctic: { seas: ['Arctic Ocean', 'Greenland Sea', 'Barents Sea', 'Norwegian Sea'], clip: [-75, 58, 75, 90] },
  BalticSea: { seas: ['Baltic Sea', 'Gulf of Bothnia', 'Gulf of Finland', 'Gulf of Riga'] },
  WesternMediterraneanSea: { seas: MED_SEAS, clip: [-10, 30, MED_CUT, 47] },
  EasternMediterraneanSea: { seas: MED_SEAS, clip: [MED_CUT, 30, 40, 47] },
};

const rect = ([w, s, e, n]) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];

const toPolys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);

function dissolve(geometries, clip) {
  const polys = geometries.filter(Boolean).flatMap(toPolys);
  let mp = polygonClipping.union(polys[0], ...polys.slice(1));
  if (clip) mp = polygonClipping.intersection(mp, rect(clip));
  return { type: 'MultiPolygon', coordinates: mp };
}

const alpha3 = (p) => p.ADM0_A3 || p.ISO_A3_EH || p.ISO_A3 || p.SOV_A3;

async function load(url, key) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed HTTP ${res.status} (${url})`);
  const fc = await res.json();
  const map = new Map();
  for (const f of fc.features) map.set(key(f.properties), f.geometry);
  return map;
}

async function main() {
  const features = [];

  // Single-country regions and dissolved groups resolve the same way: a region is
  // done once every one of its codes is found, and drops to a finer tier if any
  // is missing (small states are absent from the coarser files).
  let needed = countryRegions();
  for (const url of COUNTRY_TIERS) {
    if (!needed.length) break;
    const byCode = await load(url, alpha3);
    const missing = [];
    for (const [regionKey, codes] of needed) {
      const geometries = codes.map((code) => byCode.get(code));
      if (geometries.some((g) => !g)) {
        missing.push([regionKey, codes]);
        continue;
      }
      const geometry = geometries.length === 1 ? geometries[0] : dissolve(geometries);
      features.push({ type: 'Feature', properties: { regionKey }, geometry });
    }
    needed = missing;
  }
  for (const [regionKey, codes] of needed) {
    console.warn(`no polygon for ${regionKey} (${codes.join(', ')})`);
  }

  const byName = await load(MARINE_URL, (p) => p.name);
  for (const [regionKey, { seas, clip }] of Object.entries(MARINE)) {
    const missing = seas.filter((n) => !byName.get(n));
    if (missing.length) console.warn(`${regionKey}: missing seas ${missing.join(', ')}`);
    const geometry = dissolve(seas.map((n) => byName.get(n)), clip);
    features.push({ type: 'Feature', properties: { regionKey }, geometry });
  }

  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'map', 'regions.json');
  writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }));
  console.log(`wrote ${features.length} regions to ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
