// Bake the z5 GEBCO tiles from build-tiles.mjs into the rasters the widget loads:
//
//   bathy/flat.webp        Equal Earth, drawn by the flat view
//   bathy/flat-small.webp  the same at FLAT_SMALL_W, for small screens
//   bathy/equirect.webp    plate carree, resampled per frame by the globe
//   bathy/d/{c}_{r}.webp   2x Equal Earth tiles the flat view overlays past 1:1
//                          (skipped when BATHY_NO_DETAIL is set)

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { geoEqualEarth, geoPath } from 'd3-geo';

const TILES = join(import.meta.dirname, '..', 'tiles');
const OUT = join(import.meta.dirname, '..', 'bathy');

const SRC_Z = 5;
const TILE = 512;

const FLAT_W = Number(process.env.BATHY_FLAT_W ?? 8192);
// Same width as the Equal Earth output, so reprojection resamples at about 1:1.
const MERC_W = FLAT_W;

// Must match SMALL_W in src/lib/bathymetry.ts.
const FLAT_SMALL_W = 2048;

const EQUI_W = 4096;
const EQUI_H = 2048;

// The z5 source width (32 x 512). Tiled because WebP caps a side at 16383.
// Must match DETAIL_W and DETAIL_TILE in src/lib/bathymetry.ts.
const DETAIL_W = 16384;
const DETAIL_TILE = 2048;

const QUALITY = Number(process.env.BATHY_Q ?? 70);
// sharp quantises the unsharp mask, so anything below ~0.5 is silently a no-op.
const SHARPEN = Number(process.env.BATHY_SHARPEN ?? 0.5);
// Saturation factor for GEBCO's colour ramp; 1 leaves it unchanged.
const SAT = Number(process.env.BATHY_SAT ?? 0.6);
const REC709 = [0.2126, 0.7152, 0.0722];

const DEG = 180 / Math.PI;
const LAT_MAX = 85.0511287798;

function tilePath(z, x, y) {
  return join(TILES, String(z), String(x), `${y}.jpg`);
}

// Stitch one row of source tiles and downscale it to n x rowH raw RGB.
async function strip(ty, across, rowH, n) {
  const composite = [];
  for (let tx = 0; tx < across; tx++) {
    const file = tilePath(SRC_Z, tx, ty);
    if (!existsSync(file))
      throw new Error(`missing tile ${SRC_Z}/${tx}/${ty} -- run \`just map::tiles\` first`);
    composite.push({ input: readFileSync(file), top: 0, left: tx * TILE });
  }
  // Two pipelines: sharp resizes before it composites, so a single one would
  // drop every tile past the first off the canvas.
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
    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;
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
  const sample = sampler(merc, MERC_W);
  const dst = Buffer.alloc(EQUI_W * EQUI_H * 4);
  const px = [0, 0, 0];
  let first = -1;
  let last = -1;
  for (let j = 0; j < EQUI_H; j++) {
    const lat = 90 - ((j + 0.5) / EQUI_H) * 180;
    if (Math.abs(lat) > LAT_MAX) continue;
    const v = mercV(lat);
    for (let i = 0; i < EQUI_W; i++) {
      sample((i + 0.5) / EQUI_W, v, px);
      const d = (j * EQUI_W + i) * 4;
      dst[d] = px[0];
      dst[d + 1] = px[1];
      dst[d + 2] = px[2];
      dst[d + 3] = 255;
    }
    if (first < 0) first = j;
    last = j;
  }

  // Mercator ends at LAT_MAX. Repeat the outermost rows up to the poles: left
  // black, they would bleed a dark ring into the globe's bilinear sampling.
  const row = EQUI_W * 4;
  for (let j = 0; j < first; j++) dst.copyWithin(j * row, first * row, first * row + row);
  for (let j = last + 1; j < EQUI_H; j++) dst.copyWithin(j * row, last * row, last * row + row);

  return { data: dst, width: EQUI_W, height: EQUI_H, channels: 4 };
}

// Fit the sphere's Equal Earth bounds to width W, so every width is the same
// image up to one scale factor.
function flatGeom(W) {
  const base = geoEqualEarth().scale(1).translate([0, 0]);
  const [[x0, y0], [x1, y1]] = geoPath(base).bounds({ type: 'Sphere' });
  const s = W / (x1 - x0);
  return { base, x0, y0, s, W, H: Math.round((y1 - y0) * s) };
}

// Fill output row j. Equal Earth is pseudocylindrical (x is linear in longitude
// along a row), so one invert per row gives its latitude. Return the [first,
// last] column filled, or null when the row misses the sphere.
function flatRow(fg, sample, j, dst, off) {
  const { base, x0, y0, s, W } = fg;
  const Y = y0 + (j + 0.5) / s;
  const ll = base.invert([0, Y]);
  if (!ll || !isFinite(ll[1])) return null;
  const lat = ll[1];
  if (Math.abs(lat) > LAT_MAX) return null; // beyond the mosaic; left transparent
  const A = base([DEG, lat])[0]; // x at one radian of longitude
  if (!isFinite(A) || A === 0) return null;
  const v = mercV(lat);
  const maxX = A * Math.PI;
  const px = [0, 0, 0];
  let lo = -1;
  let hi = -1;
  for (let i = 0; i < W; i++) {
    const X = x0 + (i + 0.5) / s;
    if (X < -maxX || X > maxX) continue;
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
  const fg = flatGeom(FLAT_W);
  const sample = sampler(merc, MERC_W);
  const dst = Buffer.alloc(FLAT_W * fg.H * 4); // alloc: transparent outside the sphere

  for (let j = 0; j < fg.H; j++) {
    flatRow(fg, sample, j, dst, j * FLAT_W * 4);
    if (j % 256 === 0) process.stdout.write(`\r  flat ${j}/${fg.H} rows`);
  }
  process.stdout.write(`\r  flat ${fg.H}/${fg.H} rows\n`);
  return { data: dst, width: FLAT_W, height: fg.H, channels: 4 };
}

// Bake one tile row at a time, so the full RGBA surface never exists at once.
// Tiles off the sphere are not written: the runtime treats their 404 as empty.
async function detail(merc) {
  const fg = flatGeom(DETAIL_W);
  const sample = sampler(merc, DETAIL_W);
  const cols = DETAIL_W / DETAIL_TILE;
  const rows = Math.ceil(fg.H / DETAIL_TILE);
  mkdirSync(join(OUT, 'd'), { recursive: true });

  const band = Buffer.alloc(DETAIL_W * DETAIL_TILE * 4);
  const tile = Buffer.allocUnsafe(DETAIL_TILE * DETAIL_TILE * 4);
  let wrote = 0;

  for (let r = 0; r < rows; r++) {
    band.fill(0); // off the sphere, and the short last row, stay transparent
    const hit = new Uint8Array(cols);
    const top = r * DETAIL_TILE;
    const end = Math.min(fg.H, top + DETAIL_TILE);
    for (let j = top; j < end; j++) {
      const span = flatRow(fg, sample, j, band, (j - top) * DETAIL_W * 4);
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
      await write(join('d', `${c}_${r}.webp`), raw);
      wrote++;
    }
    process.stdout.write(`\r  detail ${r + 1}/${rows} tile rows`);
  }
  process.stdout.write('\n');
  return { cols, rows, wrote, height: fg.H };
}

function saturationMatrix(s) {
  return REC709.map((_, i) => REC709.map((l, j) => (i === j ? l + (1 - l) * s : l - l * s)));
}

async function write(name, raw) {
  const file = join(OUT, name);
  const pipe = sharp(raw.data, {
    raw: { width: raw.width, height: raw.height, channels: raw.channels },
  });
  // Keeps shelf edges legible where the stage upscales past 1:1.
  const sharpened = SHARPEN > 0 ? pipe.sharpen({ sigma: SHARPEN }) : pipe;
  const shaped = SAT === 1 ? sharpened : sharpened.recomb(saturationMatrix(SAT));
  await shaped.webp({ quality: QUALITY, alpha_quality: 100, effort: 5 }).toFile(file);
  return file;
}

async function save(name, raw) {
  const file = await write(name, raw);
  console.log(`  ${file}  ${raw.width}x${raw.height}`);
}

if (!existsSync(join(TILES, String(SRC_Z)))) {
  console.error(`no z${SRC_Z} tiles in ${TILES} -- run \`just map::tiles\` first`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

console.log(`baking from z${SRC_Z} tiles via a ${MERC_W}x${MERC_W} mercator mosaic`);
let merc = await mosaic(MERC_W);

const flatRaw = await flat(merc);
await save('flat.webp', flatRaw);

const { data, info } = await sharp(flatRaw.data, {
  raw: { width: flatRaw.width, height: flatRaw.height, channels: 4 },
})
  .resize(FLAT_SMALL_W, null, { kernel: 'lanczos3' })
  .raw()
  .toBuffer({ resolveWithObject: true });
await save('flat-small.webp', { ...info, data });

await save('equirect.webp', await equirect(merc));

if (!process.env.BATHY_NO_DETAIL) {
  merc = null; // release it before the ~800 MB detail mosaic
  console.log(`detail level via a ${DETAIL_W}x${DETAIL_W} mosaic`);
  const d = await detail(await mosaic(DETAIL_W));
  console.log(
    `  ${join(OUT, 'd')}  ${d.wrote}/${d.cols * d.rows} tiles  ${DETAIL_W}x${d.height}`,
  );
}
