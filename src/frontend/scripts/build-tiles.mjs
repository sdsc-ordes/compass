// Pre-renders GEBCO bathymetry into a raster tile pyramid we serve ourselves,
// so the map has real depth data without the visitor's browser ever contacting
// a third party.
//
//   just map::tiles [maxZoom]
//
// GEBCO's grid is free for commercial use with attribution, which the map
// carries. Output goes to src/frontend/tiles/{z}/{x}/{y}.jpg and is gitignored: it is
// ~53 MB, regenerable, and belongs on the server rather than in history.
//
// Already-written tiles are skipped, so an interrupted run resumes.

import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'tiles');
const MAX_ZOOM = Number(process.argv[2] ?? 5);

// 512px JPEG is the cheap corner of the trade: a quarter the requests of 256px
// for the same detail, and a twentieth the bytes of PNG on a smooth gradient.
const TILE_PX = 512;
const FORMAT = 'image/jpeg';
const CONCURRENCY = 8;

const R = 20037508.342789244; // half the Web Mercator extent, in metres

function bbox(z, x, y) {
  const span = (2 * R) / 2 ** z;
  return [-R + x * span, R - (y + 1) * span, -R + (x + 1) * span, R - y * span];
}

function source(z, x, y) {
  const [west, south, east, north] = bbox(z, x, y);
  return (
    'https://wms.gebco.net/mapserv?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
    `&LAYERS=GEBCO_LATEST&WIDTH=${TILE_PX}&HEIGHT=${TILE_PX}&CRS=EPSG:3857` +
    `&BBOX=${west},${south},${east},${north}&FORMAT=${FORMAT}`
  );
}

function planned() {
  const tiles = [];
  for (let z = 0; z <= MAX_ZOOM; z++) {
    for (let x = 0; x < 2 ** z; x++) {
      for (let y = 0; y < 2 ** z; y++) tiles.push([z, x, y]);
    }
  }
  return tiles;
}

async function render([z, x, y]) {
  const dir = join(OUT, String(z), String(x));
  const path = join(dir, `${y}.jpg`);
  // A truncated tile from an interrupted run would be cached as valid.
  if (existsSync(path) && statSync(path).size > 1024) return 0;

  const response = await fetch(source(z, x, y));
  if (!response.ok) throw new Error(`z${z}/${x}/${y}: HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length < 1024)
    throw new Error(`z${z}/${x}/${y}: ${body.length} bytes, too small to be a tile`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, body);
  return body.length;
}

async function main() {
  const tiles = planned();
  console.log(`${tiles.length} tiles for z0-${MAX_ZOOM} at ${TILE_PX}px -> ${OUT}`);

  let done = 0;
  let bytes = 0;
  const failures = [];
  const queue = tiles.slice();

  async function worker() {
    while (queue.length) {
      const tile = queue.shift();
      try {
        // Read-modify-write across an await would lose updates between workers.
        const written = await render(tile);
        bytes += written;
      } catch (e) {
        failures.push(e.message);
      }
      done++;
      if (done % 100 === 0 || done === tiles.length) {
        process.stdout.write(
          `\r  ${done}/${tiles.length}  ${(bytes / 1e6).toFixed(0)} MB written`,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write('\n');

  if (failures.length) {
    console.error(`${failures.length} tile(s) failed; re-run to retry just those:`);
    failures.slice(0, 10).forEach((f) => console.error(`  ${f}`));
    process.exit(1);
  }
  console.log(`done: ${tiles.length} tiles, ${(bytes / 1e6).toFixed(0)} MB fetched this run`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
