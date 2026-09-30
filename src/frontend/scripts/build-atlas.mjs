// Build public/basemap/atlas.json (country topology) and src/atlas-labels.json
// (country and sea labels) from world-atlas and Natural Earth.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { geoCentroid } from 'd3-geo';

const ATLAS = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const COUNTRIES = `${NE}/ne_50m_admin_0_countries.geojson`;
const SEAS = `${NE}/ne_50m_geography_marine_polys.geojson`;
const ROOT = join(import.meta.dirname, '..');

// world-atlas quantizes to 1e5 steps per side; 5x coarser (0.018 deg) is still
// finer than a bathy/d pixel at full zoom.
const COARSEN = 5;

// Map Natural Earth's label zoom onto the stage's k (1..9). Its lowest country
// sits at 1.7, so -0.7 puts the world-view set at k 1.
const stageK = (minLabel) => Math.max(1, Math.round((minLabel - 0.7) * 10) / 10);

const round = (n) => Math.round(n * 100) / 100;

const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed HTTP ${res.status} (${url})`);
  return res.json();
};

// Keep only objects.countries, the one object the stage reads.
function slim(topology) {
  const arcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    const pts = arc.map(([dx, dy]) => [
      Math.round((x += dx) / COARSEN),
      Math.round((y += dy) / COARSEN),
    ]);
    // Drop repeats but keep both ends: neighbouring arcs share them.
    const kept = pts.filter(
      (p, i) =>
        i === 0 || i === pts.length - 1 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1],
    );
    return kept.map((p, i) => (i ? [p[0] - kept[i - 1][0], p[1] - kept[i - 1][1]] : p));
  });
  const { scale, translate } = topology.transform;
  return {
    type: 'Topology',
    bbox: topology.bbox,
    transform: { scale: scale.map((s) => s * COARSEN), translate },
    objects: {
      countries: {
        type: 'GeometryCollection',
        geometries: topology.objects.countries.geometries.map(({ type, arcs }) => ({
          type,
          arcs,
        })),
      },
    },
    arcs,
  };
}

const [topo, countries, seas] = await Promise.all([get(ATLAS), get(COUNTRIES), get(SEAS)]);

if (!topo?.objects?.countries) throw new Error('no objects.countries in the topology');

// Natural Earth supplies only the names, ranks and anchor points.
const labels = {
  cty: countries.features
    .filter((f) => f.properties.NAME_EN && f.properties.LABEL_X != null)
    .map((f) => ({
      en: f.properties.NAME_EN,
      de: f.properties.NAME_DE || f.properties.NAME_EN,
      k: stageK(f.properties.MIN_LABEL),
      c: [round(f.properties.LABEL_X), round(f.properties.LABEL_Y)],
    }))
    .sort((a, b) => a.k - b.k),
  sea: seas.features
    .filter((f) => f.properties.name_en || f.properties.name)
    .map((f) => ({
      en: f.properties.name_en || f.properties.name,
      de: f.properties.name_de || f.properties.name_en || f.properties.name,
      k: stageK(f.properties.min_label),
      // Type size tier: scalerank 0 is oceans, 1-2 seas, 3+ gulfs and straits.
      t: f.properties.scalerank === 0 ? 0 : f.properties.scalerank <= 2 ? 1 : 2,
      c: geoCentroid(f).map(round),
    }))
    .sort((a, b) => a.k - b.k),
};

writeFileSync(join(ROOT, 'public', 'basemap', 'atlas.json'), JSON.stringify(slim(topo)));
writeFileSync(join(ROOT, 'src', 'atlas-labels.json'), JSON.stringify(labels));
console.log(
  `wrote ${topo.objects.countries.geometries.length} countries, ` +
    `${labels.cty.length} country labels and ${labels.sea.length} sea labels`,
);
