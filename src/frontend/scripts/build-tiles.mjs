// Fetch the GEBCO Web Mercator tile pyramid into tiles/{z}/{x}/{y}.jpg, the input
// of build-bathymetry.mjs. Tiles already on disk are skipped.
// Usage: node scripts/build-tiles.mjs [maxzoom=5]

import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'tiles');
const MAX_ZOOM = Number(process.argv[2] ?? 5);

const TILE_PX = 512;
const FORMAT = 'image/jpeg';
const CONCURRENCY = 8;
// Anything smaller is an error page, not a tile.
const MIN_TILE_BYTES = 1024;

// Half the width of the EPSG:3857 world, in metres.
const MERCATOR_EXTENT = 20037508.342789244;

function bbox(z, x, y) {
  const span = (2 * MERCATOR_EXTENT) / 2 ** z;
  return [
    -MERCATOR_EXTENT + x * span,
    MERCATOR_EXTENT - (y + 1) * span,
    -MERCATOR_EXTENT + (x + 1) * span,
    MERCATOR_EXTENT - y * span,
  ];
}

function wmsUrl(z, x, y) {
  const [west, south, east, north] = bbox(z, x, y);
  // Pinned: GEBCO_LATEST silently rolls onto the next annual grid.
  return (
    'https://wms.gebco.net/2026/mapserv?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
    `&LAYERS=GEBCO_2026&WIDTH=${TILE_PX}&HEIGHT=${TILE_PX}&CRS=EPSG:3857` +
    `&BBOX=${west},${south},${east},${north}&FORMAT=${FORMAT}`
  );
}

function allTiles() {
  const tiles = [];
  for (let z = 0; z <= MAX_ZOOM; z++) {
    for (let x = 0; x < 2 ** z; x++) {
      for (let y = 0; y < 2 ** z; y++) tiles.push([z, x, y]);
    }
  }
  return tiles;
}

// Return the bytes written, 0 when the tile is already on disk.
async function fetchTile([z, x, y]) {
  const dir = join(OUT, String(z), String(x));
  const path = join(dir, `${y}.jpg`);
  if ((statSync(path, { throwIfNoEntry: false })?.size ?? 0) > MIN_TILE_BYTES) return 0;

  const response = await fetch(wmsUrl(z, x, y));
  if (!response.ok) throw new Error(`z${z}/${x}/${y}: HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length < MIN_TILE_BYTES)
    throw new Error(`z${z}/${x}/${y}: ${body.length} bytes, too small to be a tile`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, body);
  return body.length;
}

const tiles = allTiles();
console.log(`${tiles.length} tiles for z0-${MAX_ZOOM} at ${TILE_PX}px -> ${OUT}`);

let next = 0;
let done = 0;
let bytes = 0;
const failures = [];

async function worker() {
  while (next < tiles.length) {
    const tile = tiles[next++];
    try {
      const written = await fetchTile(tile);
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
