import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { geoCentroid } from 'd3-geo';

const ATLAS = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
const CTY = `${NE}/ne_50m_admin_0_countries.geojson`;
const SEA = `${NE}/ne_50m_geography_marine_polys.geojson`;

// Natural Earth rates a label by the map zoom it earns its place at. Ours runs
// K_MIN 1 to K_MAX 9 and its lowest country sits at 1.7, so shifting by 0.7 puts
// the world-view set at k 1 and spreads the rest to about k 6.
const atK = (minLabel) => Math.max(1, Math.round((minLabel - 0.7) * 10) / 10);

const get = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed HTTP ${res.status} (${url})`);
  return res.json();
};

const [topo, cty, sea] = await Promise.all([get(ATLAS), get(CTY), get(SEA)]);

if (!topo?.objects?.countries) throw new Error('no objects.countries in the topology');

const here = dirname(fileURLToPath(import.meta.url));
const round = (n) => Math.round(n * 100) / 100;

// The geometry stays world-atlas: already simplified, and the stage only needs a
// point to hang a name on. Natural Earth is here for the naming and the ranking.
const labels = {
  cty: cty.features
    .filter((f) => f.properties.NAME_EN && f.properties.LABEL_X != null)
    .map((f) => ({
      en: f.properties.NAME_EN,
      de: f.properties.NAME_DE || f.properties.NAME_EN,
      k: atK(f.properties.MIN_LABEL),
      c: [round(f.properties.LABEL_X), round(f.properties.LABEL_Y)],
    }))
    .sort((a, b) => a.k - b.k),
  // scalerank 0 is the oceans, 1-2 the named seas, 3-4 the gulfs and straits --
  // the three type sizes the stage sets them in.
  sea: sea.features
    .filter((f) => f.properties.name_en || f.properties.name)
    .map((f) => ({
      en: f.properties.name_en || f.properties.name,
      de: f.properties.name_de || f.properties.name_en || f.properties.name,
      k: atK(f.properties.min_label),
      t: f.properties.scalerank === 0 ? 0 : f.properties.scalerank <= 2 ? 1 : 2,
      c: geoCentroid(f).map(round),
    }))
    .sort((a, b) => a.k - b.k),
};

writeFileSync(join(here, '..', 'src', 'atlas.json'), JSON.stringify(topo));
writeFileSync(join(here, '..', 'src', 'atlas-labels.json'), JSON.stringify(labels));
console.log(
  `wrote ${topo.objects.countries.geometries.length} countries, ` +
    `${labels.cty.length} country labels and ${labels.sea.length} sea labels`,
);
