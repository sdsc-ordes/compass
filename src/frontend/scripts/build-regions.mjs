// Builds src/map/regions.json — one boundary polygon per compass:CountryArea
// concept, keyed by `properties.regionKey` (the concept IRI local name).
// Map.svelte joins these onto the geometry-less Country/Area features.
//
//   node scripts/build-regions.mjs   (needs network)
//
// Countries come from Natural Earth Admin-0 (England approximated as GBR).
// Marine areas are composed from Natural Earth's named sea polygons, so they
// follow coastlines. COUNTRY/MARINE here mirror ontology/vocab.ttl — keep synced.

import { writeFileSync } from 'node:fs';
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

const COUNTRY = {
  Australia: 'AUS',
  Benin: 'BEN', Bulgaria: 'BGR', England: 'GBR', FaroeIslands: 'FRO',
  France: 'FRA', Greece: 'GRC', Iceland: 'ISL', Italy: 'ITA', Japan: 'JPN',
  Maldives: 'MDV', Mauritania: 'MRT', Norway: 'NOR', Slovenia: 'SVN',
  Spain: 'ESP', Switzerland: 'CHE', Venezuela: 'VEN',
};

const MED_SEAS = ['Mediterranean Sea', 'Alboran Sea', 'Balearic Sea', 'Golfe du Lion',
  'Ligurian Sea', 'Tyrrhenian Sea', 'Adriatic Sea', 'Ionian Sea', 'Aegean Sea', 'Sea of Crete'];
const MED_CUT = 12.5; // Strait of Sicily — divides western and eastern basins

// regionKey -> { seas, clip:[W,S,E,N] }. Sub-seas are dissolved into one shape;
// clip trims to the relevant basin/sector.
const MARINE = {
  Arctic: { seas: ['Arctic Ocean', 'Greenland Sea', 'Barents Sea', 'Norwegian Sea'], clip: [-75, 58, 75, 90] },
  NorthSeaBalticSea: { seas: ['North Sea', 'Baltic Sea', 'Skagerrak', 'Kattegat', 'Gulf of Finland', 'Gulf of Riga'] },
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

  let needed = Object.entries(COUNTRY);
  for (const url of COUNTRY_TIERS) {
    if (!needed.length) break;
    const byCode = await load(url, alpha3);
    const missing = [];
    for (const [regionKey, code] of needed) {
      const geometry = byCode.get(code);
      if (geometry) features.push({ type: 'Feature', properties: { regionKey }, geometry });
      else missing.push([regionKey, code]);
    }
    needed = missing;
  }
  for (const [regionKey, code] of needed) console.warn(`no polygon for ${regionKey} (${code})`);

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
