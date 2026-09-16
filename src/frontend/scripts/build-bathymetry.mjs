// Bakes the GEBCO tile pyramid (see build-tiles.mjs) into the two rasters the
// widget actually loads at runtime:
//
//   bathy/flat.webp      world pre-projected into Natural Earth 1, drawn with a
//                        single drawImage because flat pan/zoom is an exact
//                        similarity transform of a fixed image.
//   bathy/equirect.webp  plate carree, decoded to ImageData and resampled per
//                        frame -- only the globe needs that, because rotation is
//                        the one transform that is not affine.
//   bathy/d/{c}_{r}.webp a 2x Natural Earth level, fetched only once the flat
//                        view is upscaling the base past 1:1.
//
// Run after `just tiles`. The tiles are a build input only; nothing ships them.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { geoNaturalEarth1, geoPath } from 'd3-geo';

const HERE = dirname(fileURLToPath(import.meta.url));
const TILES = join(HERE, '..', 'tiles');
const OUT = join(HERE, '..', 'bathy');

const SRC_Z = 5;
const TILE = 512;

// Intermediate Web Mercator mosaic. Matches the 8192px Natural Earth width, so
// the reprojection below resamples at roughly 1:1 and neither axis is starved.
const MERC = Number(process.env.BATHY_MERC ?? 8192);

const FLAT_W = Number(process.env.BATHY_FLAT_W ?? 8192);
const EQUI_W = 4096;
const EQUI_H = 2048;

// Detail level: 2x the base, which is exactly the z5 source width (32 x 512), so
// it adds real data rather than inventing it. Tiled because WebP caps a side at
// 16383, and its mosaic runs 1:1 for the same reason the base one does.
const DETAIL_W = 16384;
const DETAIL_MERC = DETAIL_W;
const DETAIL_TILE = 2048;

const QUALITY = Number(process.env.BATHY_Q ?? 70);
// sharp quantises the unsharp mask, so anything below ~0.5 is silently a no-op.
const SHARPEN = Number(process.env.BATHY_SHARPEN ?? 0.5);

const DEG = 180 / Math.PI;
const LAT_MAX = 85.0511287798;

function tilePath(z, x, y) {
  return join(TILES, String(z), String(x), `${y}.jpg`);
}

// Stitches one row of source tiles, downscales it, and returns raw RGB.
async function strip(ty, across, rowH, n) {
  const composite = [];
  for (let tx = 0; tx < across; tx++) {
    const file = tilePath(SRC_Z, tx, ty);
    if (!existsSync(file))
      throw new Error(`missing tile ${SRC_Z}/${tx}/${ty} -- run \`just tiles\` first`);
    composite.push({ input: readFileSync(file), top: 0, left: tx * TILE });
  }
  // Two passes on purpose: sharp resizes before it composites, so shrinking in
  // the same pipeline would drop every tile past the first off the canvas.
  const full = await sharp({
    create: { width: across * TILE, height: TILE, channels: 3, background: '#000' },
  })
    .composite(composite)
    .png({ compressionLevel: 0 })
    .toBuffer();

  return sharp(full).resize(n, rowH, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
}

async function mosaic(n) {
  const across = 2 ** SRC_Z;
  const rowH = n / across;
  if (!Number.isInteger(rowH))
    throw new Error(`mosaic ${n} is not divisible by ${across} tile rows`);

  const merc = Buffer.allocUnsafe(n * n * 3);
  for (let ty = 0; ty < across; ty++) {
    const raw = await strip(ty, across, rowH, n);
    raw.copy(merc, ty * rowH * n * 3);
    process.stdout.write(`\r  mosaic ${ty + 1}/${across} tile rows`);
  }
  process.stdout.write('\n');
  return merc;
}

// Bilinear sample of the mercator mosaic. u wraps in longitude, v clamps.
function sampler(merc, n) {
  return (u, v, out) => {
    const gx = u * n - 0.5;
    const gy = v * n - 0.5;
    const x0 = Math.floor(gx);
    const y0 = Math.min(n - 1, Math.max(0, Math.floor(gy)));
    const y1 = Math.min(n - 1, y0 + 1);
    const fx = gx - x0;
    const fy = Math.min(1, Math.max(0, gy - y0));
    const xa = ((x0 % n) + n) % n;
    const xb = (xa + 1) % n;
    const ra = y0 * n * 3;
    const rb = y1 * n * 3;
    const w00 = (1 - fx) * (1 - fy),
      w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy,
      w11 = fx * fy;
    for (let c = 0; c < 3; c++) {
      out[c] =
        merc[ra + xa * 3 + c] * w00 +
        merc[ra + xb * 3 + c] * w10 +
        merc[rb + xa * 3 + c] * w01 +
        merc[rb + xb * 3 + c] * w11;
    }
  };
}

const mercV = (lat) => {
  const phi = lat / DEG;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI);
};

async function equirect(merc) {
  const sample = sampler(merc, MERC);
  const dst = Buffer.alloc(EQUI_W * EQUI_H * 4); // alloc: transparent beyond the mercator limit
  const px = [0, 0, 0];
  for (let j = 0; j < EQUI_H; j++) {
    const lat = 90 - ((j + 0.5) / EQUI_H) * 180;
    if (Math.abs(lat) > LAT_MAX) continue; // no source data; the sea colour shows through
    const v = mercV(lat);
    for (let i = 0; i < EQUI_W; i++) {
      sample((i + 0.5) / EQUI_W, v, px);
      const d = (j * EQUI_W + i) * 4;
      dst[d] = px[0];
      dst[d + 1] = px[1];
      dst[d + 2] = px[2];
      dst[d + 3] = 255;
    }
  }
  return { data: dst, width: EQUI_W, height: EQUI_H, channels: 4 };
}

// The raster fits the sphere's Natural Earth bounding box to width, which is
// what lets the runtime map any width onto any other by a single scale factor.
function neGeom(W) {
  const base = geoNaturalEarth1().scale(1).translate([0, 0]);
  const [[x0, y0], [x1, y1]] = geoPath(base).bounds({ type: 'Sphere' });
  const s = W / (x1 - x0);
  return { base, x0, y0, s, W, H: Math.round((y1 - y0) * s) };
}

// Natural Earth 1 is pseudocylindrical: parallels are straight and x is exactly
// linear in longitude. So each output row needs one invert for its latitude,
// not one per pixel -- 4k inverts instead of 34M.
// Returns the first and last column it filled, so the tiler can tell which tiles
// are entirely off the sphere without rescanning them.
function neRow(ne, sample, j, dst, off) {
  const { base, x0, y0, s, W } = ne;
  const Y = y0 + (j + 0.5) / s;
  const ll = base.invert([0, Y]);
  if (!ll || !isFinite(ll[1])) return null;
  const lat = ll[1];
  if (Math.abs(lat) > LAT_MAX) return null; // no source data; the sea colour shows through
  const A = base([DEG, lat])[0]; // x at one radian of longitude
  if (!isFinite(A) || A === 0) return null;
  const v = mercV(lat);
  const maxX = A * Math.PI;
  const px = [0, 0, 0];
  let lo = -1;
  let hi = -1;
  for (let i = 0; i < W; i++) {
    const X = x0 + (i + 0.5) / s;
    if (X < -maxX || X > maxX) continue; // outside the sphere on this row
    sample(((X / A) * DEG) / 360 + 0.5, v, px);
    const d = off + i * 4;
    dst[d] = px[0];
    dst[d + 1] = px[1];
    dst[d + 2] = px[2];
    dst[d + 3] = 255;
    if (lo < 0) lo = i;
    hi = i;
  }
  return lo < 0 ? null : [lo, hi];
}

async function flat(merc) {
  const ne = neGeom(FLAT_W);
  const sample = sampler(merc, MERC);
  const dst = Buffer.alloc(FLAT_W * ne.H * 4); // alloc: transparent outside the sphere

  for (let j = 0; j < ne.H; j++) {
    neRow(ne, sample, j, dst, j * FLAT_W * 4);
    if (j % 256 === 0) process.stdout.write(`\r  natural earth ${j}/${ne.H} rows`);
  }
  process.stdout.write(`\r  natural earth ${ne.H}/${ne.H} rows\n`);
  return { data: dst, width: FLAT_W, height: ne.H, channels: 4 };
}

// Baked one tile row at a time so the full 16384x8520 RGBA surface never has to
// exist at once. Tiles the sphere never reaches are not written at all -- the
// runtime reads their 404 as empty and leaves the base showing.
async function detail(merc) {
  const ne = neGeom(DETAIL_W);
  const sample = sampler(merc, DETAIL_MERC);
  const cols = DETAIL_W / DETAIL_TILE;
  const rows = Math.ceil(ne.H / DETAIL_TILE);
  mkdirSync(join(OUT, 'd'), { recursive: true });

  const band = Buffer.alloc(DETAIL_W * DETAIL_TILE * 4);
  const tile = Buffer.allocUnsafe(DETAIL_TILE * DETAIL_TILE * 4);
  let wrote = 0;

  for (let r = 0; r < rows; r++) {
    band.fill(0); // off the sphere, and the short last row, stay transparent
    const hit = new Uint8Array(cols);
    const top = r * DETAIL_TILE;
    const end = Math.min(ne.H, top + DETAIL_TILE);
    for (let j = top; j < end; j++) {
      const span = neRow(ne, sample, j, band, (j - top) * DETAIL_W * 4);
      if (!span) continue;
      const last = Math.floor(span[1] / DETAIL_TILE);
      for (let c = Math.floor(span[0] / DETAIL_TILE); c <= last; c++) hit[c] = 1;
    }
    for (let c = 0; c < cols; c++) {
      if (!hit[c]) continue;
      for (let y = 0; y < DETAIL_TILE; y++) {
        const from = (y * DETAIL_W + c * DETAIL_TILE) * 4;
        band.copy(tile, y * DETAIL_TILE * 4, from, from + DETAIL_TILE * 4);
      }
      const raw = { data: tile, width: DETAIL_TILE, height: DETAIL_TILE, channels: 4 };
      await write(join('d', `${c}_${r}.webp`), raw, true);
      wrote++;
    }
    process.stdout.write(`\r  detail ${r + 1}/${rows} tile rows`);
  }
  process.stdout.write('\n');
  return { cols, rows, wrote, height: ne.H };
}

async function write(name, raw, alpha) {
  const file = join(OUT, name);
  const pipe = sharp(raw.data, {
    raw: { width: raw.width, height: raw.height, channels: raw.channels },
  });
  // The stage upscales this past 1:1 at deep zoom, where plain interpolation
  // reads as mush. A light unsharp adds no data but keeps shelf edges legible.
  const shaped = SHARPEN > 0 ? pipe.sharpen({ sigma: SHARPEN }) : pipe;
  await shaped
    .webp({ quality: QUALITY, alpha_quality: alpha ? 100 : undefined, effort: 5 })
    .toFile(file);
  return file;
}

async function main() {
  if (!existsSync(join(TILES, String(SRC_Z)))) {
    console.error(`no z${SRC_Z} tiles in ${TILES} -- run \`just tiles\` first`);
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });

  console.log(`baking from z${SRC_Z} tiles via a ${MERC}x${MERC} mercator mosaic`);
  let merc = await mosaic(MERC);

  const f = await flat(merc);
  const ff = await write('flat.webp', f, true);
  console.log(`  ${ff}  ${f.width}x${f.height}`);

  const e = await equirect(merc);
  const ef = await write('equirect.webp', e, true);
  console.log(`  ${ef}  ${e.width}x${e.height}`);

  // The detail level is gitignored -- it is a deploy step, not a clone one --
  // so a rebake of the committed pair alone skips its ~800 MB mosaic.
  if (process.env.BATHY_NO_DETAIL) return;

  merc = null; // the detail mosaic is ~800 MB; do not hold both
  console.log(`detail level via a ${DETAIL_MERC}x${DETAIL_MERC} mosaic`);
  const d = await detail(await mosaic(DETAIL_MERC));
  console.log(
    `  ${join(OUT, 'd')}  ${d.wrote}/${d.cols * d.rows} tiles  ${DETAIL_W}x${d.height}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
