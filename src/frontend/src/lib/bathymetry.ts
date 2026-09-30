import { geoEqualEarth, geoPath, type GeoProjection } from 'd3-geo';
import type { Palette } from './palette';

// Rasters baked by scripts/build-bathymetry.mjs.
//
// Flat: Equal Earth pan and zoom are a similarity transform of one pre-projected
// image, so a frame is a single drawImage. Past about k=4 that upscales the
// base, so a 2x detail level is tiled over the part in view.
//
// Globe: rotation is not affine, so each frame resamples the equirectangular
// raster.
const FLAT = `bathy/flat.webp?v=${__ASSET_V__}`;
// Used while the sphere is at most SMALL_W device px wide, and always under
// Save-Data. SMALL_W matches FLAT_SMALL_W in scripts/build-bathymetry.mjs.
const FLAT_SMALL = `bathy/flat-small.webp?v=${__ASSET_V__}`;
const SMALL_W = 2048;
const EQUI = `bathy/equirect.webp?v=${__ASSET_V__}`;
const DETAIL = 'bathy/d';

// The detail level's full width, tiled because WebP caps a side at 16383.
// Both match scripts/build-bathymetry.mjs.
const DETAIL_W = 16384;
const DETAIL_TILE = 2048;

// Detail tiles kept loaded. A viewport spans about 2x2.
const DETAIL_KEEP = 12;

// Globe mesh cell, in raster px: nodes are inverted exactly, pixels between
// them interpolated.
const CELL = 8;
// Fraction of the texture width a mesh cell may span before its pixels are
// inverted exactly. See the pole note in reproject().
const SMEAR = 0.12;

// Globe raster area in px: about 1:1 at rest, far less while rotating, since
// that is paid every frame.
const BUDGET_IDLE = 2_800_000;
const BUDGET_DRAG = 500_000;

// Probe points: where they land tells whether two projections differ only by a
// scale and a translate (see similarity()).
const REF: [number, number][] = [
  [0, 0],
  [60, 0],
  [0, 45],
];

// Allowed misfit of a probe point, px.
const REF_TOL = 0.5;

// Below this fraction of the base's width, draw from a downscaled copy rather
// than rescaling the full raster every frame.
const MIP_AT = 0.5;

interface Snapshot {
  canvas: HTMLCanvasElement;
  W: number;
  H: number;
  box: Box;
  ref: [number, number][];
}

// The screen rect a raster covers: for the globe, the sphere's bounds, so the
// budget is not spent on the canvas around it.
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Grid {
  px: Uint8ClampedArray;
  w: number;
  h: number;
  // w - 1; w is a power of two, so `x & mask` wraps longitude.
  mask: number;
}

export class Bathymetry {
  private flatImg: HTMLImageElement | null = null;
  private flatRef: [number, number][] | null = null;
  private mip: HTMLCanvasElement | null = null;
  private mipW = 0;
  // The full base's width, read off the image (BATHY_FLAT_W sets it at bake
  // time); detail tiles wait for it.
  private fullW = Infinity;

  private equi: Grid | null = null;
  private asked = { small: false, full: false, equi: false };

  // Insertion order is the LRU. null: requested and not loaded yet, or never
  // coming, for a tile the bake left out as wholly off the sphere.
  private tiles = new Map<string, HTMLImageElement | null>();

  private buf: HTMLCanvasElement | null = null;
  private dragBuf: HTMLCanvasElement | null = null;
  private snap: Snapshot | null = null;
  private scratchImg: ImageData | null = null;

  available = false;
  private absent = false;

  constructor(
    private base: string,
    private onReady: () => void,
  ) {}

  // False once a raster has failed to load. True before anything is fetched, so
  // the switch that triggers the first load is offered.
  get ready(): boolean {
    return !this.absent;
  }

  paint(
    ctx: CanvasRenderingContext2D,
    pr: GeoProjection,
    W: number,
    H: number,
    p: Palette,
    globe: boolean,
    interact: boolean,
    depth: boolean,
    dpr: number,
  ): void {
    ctx.save();
    ctx.fillStyle = p.page;
    ctx.fillRect(0, 0, W, H);

    const path = geoPath(pr, ctx);
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.fillStyle = p.sea;
    ctx.fill();

    if (depth && !this.absent) {
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      this.overlay(ctx, pr, W, H, globe, interact, dpr);
    }
    ctx.restore();
  }

  clear(): void {
    this.snap = null;
    this.dragBuf = null;
    this.buf = null;
    this.scratchImg = null;
    this.mip = null;
    this.mipW = 0;
    this.tiles.clear();
  }

  private overlay(
    ctx: CanvasRenderingContext2D,
    pr: GeoProjection,
    W: number,
    H: number,
    globe: boolean,
    interact: boolean,
    dpr: number,
  ): void {
    if (!globe) {
      this.blit(ctx, pr, W, H, dpr);
      return;
    }

    // Mid-gesture, a zoom of the last settled raster is reused while it still
    // covers the sphere.
    if (interact) {
      const snap = this.snap;
      const move = snap && snap.W === W && snap.H === H ? similarity(snap.ref, pr) : null;
      if (snap && move && covered(move, snap, pr, W, H)) {
        const b = snap.box;
        ctx.drawImage(
          snap.canvas,
          move.g * b.x + move.dx,
          move.g * b.y + move.dy,
          move.g * b.w,
          move.g * b.h,
        );
        return;
      }
    }
    const out = this.reproject(pr, W, H, interact, dpr);
    if (out) ctx.drawImage(out.canvas, out.box.x, out.box.y, out.box.w, out.box.h);
  }

  // Flat view: one drawImage of the pre-projected raster.
  private blit(
    ctx: CanvasRenderingContext2D,
    pr: GeoProjection,
    W: number,
    H: number,
    dpr: number,
  ): void {
    const img = this.flat(pr.scale() * FLAT_SPAN * dpr);
    const ref = this.flatRef;
    if (!img || !ref) return;

    const t = similarity(ref, pr);
    if (!t) return;

    const dw = t.g * img.width;
    const dh = t.g * img.height;
    ctx.drawImage(this.level(img, dw), t.dx, t.dy, dw, dh);
    // Over the base, so a tile in flight or skipped by the bake leaves no hole.
    if (dw > this.fullW) this.detail(ctx, t, img.width, img.height, W, H);
  }

  // Same similarity, less gain: the base maps basePx -> g*basePx + d, so a level
  // k times wider maps detailPx -> (g/k)*detailPx + d.
  private detail(
    ctx: CanvasRenderingContext2D,
    t: Move,
    baseW: number,
    baseH: number,
    W: number,
    H: number,
  ): void {
    const k = DETAIL_W / baseW;
    const g = t.g / k;
    const span = g * DETAIL_TILE;
    const cols = Math.ceil((baseW * k) / DETAIL_TILE);
    const rows = Math.ceil((baseH * k) / DETAIL_TILE);

    const c0 = Math.max(0, Math.floor(-t.dx / span));
    const c1 = Math.min(cols - 1, Math.floor((W - t.dx) / span));
    const r0 = Math.max(0, Math.floor(-t.dy / span));
    const r1 = Math.min(rows - 1, Math.floor((H - t.dy) / span));

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const img = this.tile(`${c}_${r}`);
        if (!img) continue;
        ctx.drawImage(img, t.dx + c * span, t.dy + r * span, g * img.width, g * img.height);
      }
    }
  }

  private tile(key: string): HTMLImageElement | null {
    const held = this.tiles.get(key);
    if (held !== undefined) {
      if (held) {
        this.tiles.delete(key); // re-insert as most recently used
        this.tiles.set(key, held);
      }
      return held;
    }
    // A 404 (a tile wholly off the sphere) leaves this null, so it is not
    // requested again.
    this.tiles.set(key, null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      this.tiles.set(key, img);
      this.evict();
      this.onReady();
    };
    img.src = `${this.base}/${DETAIL}/${key}.webp?v=${__ASSET_V__}`;
    return null;
  }

  // Evicts loaded tiles only: dropping a null would re-request a missing tile
  // every frame.
  private evict(): void {
    let live = 0;
    for (const img of this.tiles.values()) if (img) live++;
    for (const [key, img] of this.tiles) {
      if (live <= DETAIL_KEEP) return;
      if (!img) continue;
      this.tiles.delete(key);
      live--;
    }
  }

  // The base, or a copy downscaled to the next power-of-two width at or above
  // drawW, rebuilt only when that width changes.
  private level(img: HTMLImageElement, drawW: number): CanvasImageSource {
    if (drawW >= img.width * MIP_AT) return img;
    const want = 1 << Math.ceil(Math.log2(Math.max(64, drawW)));
    if (this.mip && this.mipW === want) return this.mip;

    const cv = this.mip ?? document.createElement('canvas');
    cv.width = want; // also clears it
    cv.height = Math.max(1, Math.round((want * img.height) / img.width));
    const c = cv.getContext('2d');
    if (!c) return img;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(img, 0, 0, cv.width, cv.height);
    this.mip = cv;
    this.mipW = want;
    return cv;
  }

  private reproject(
    pr: GeoProjection,
    W: number,
    H: number,
    interact: boolean,
    dpr: number,
  ): { canvas: HTMLCanvasElement; box: Box } | null {
    const invert = pr.invert;
    if (!invert) return null;

    const src = this.equirect();
    if (!src) return null;

    if (!interact) this.snap = null;

    const box = sphereBox(pr, W, H);
    if (!box) return null;

    const dw = box.w * dpr,
      dh = box.h * dpr;
    const budget = interact ? BUDGET_DRAG : BUDGET_IDLE;
    const scale = Math.min(1, Math.sqrt(budget / Math.max(1, dw * dh)));
    const rw = Math.max(2, Math.round(dw * scale));
    const rh = Math.max(2, Math.round(dh * scale));
    const perCss = rw / box.w;

    const cols = Math.ceil(rw / CELL);
    const rows = Math.ceil(rh / CELL);
    const nodes = (cols + 1) * (rows + 1);
    const nx = new Float64Array(nodes);
    const ny = new Float64Array(nodes);
    const ok = new Uint8Array(nodes);

    let any = false;
    let rowStart = 0;
    for (let j = 0; j <= rows; j++) {
      const y = box.y + (j * CELL) / perCss;
      let prev = NaN;
      let first = NaN;
      for (let i = 0; i <= cols; i++) {
        const x = box.x + (i * CELL) / perCss;
        const k = j * (cols + 1) + i;
        const ll = invert([x, y]);
        if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) {
          ok[k] = 0;
          continue;
        }
        let u = (ll[0] + 180) / 360;
        if (isFinite(prev)) u -= Math.round(u - prev);
        else if (isFinite(rowStart)) u -= Math.round(u - rowStart);
        if (!isFinite(first)) first = u;
        prev = u;
        nx[k] = u;
        ny[k] = (90 - ll[1]) / 180;
        ok[k] = 1;
        any = true;
      }
      if (isFinite(first)) rowStart = first;
    }
    if (!any) return null;

    // Crossing a pole flips longitude by half a turn, which the whole-turn unwrap
    // above cannot correct, so interpolating across that cell smears a ray from
    // the pole to the limb. Cells spanning more than SMEAR of the texture (the
    // pole row, and some cells hard against the limb) are inverted per pixel.
    const exact = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = j * (cols + 1) + i;
        const c = a + (cols + 1);
        if (!ok[a] || !ok[a + 1] || !ok[c] || !ok[c + 1]) continue;
        const lo = Math.min(nx[a], nx[a + 1], nx[c], nx[c + 1]);
        const hi = Math.max(nx[a], nx[a + 1], nx[c], nx[c + 1]);
        if (hi - lo > SMEAR) exact[j * cols + i] = 1;
      }
    }

    const out = this.buffer(rw, rh, interact);
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    const img = this.scratch(ctx, rw, rh);
    const dst = img.data;

    const px = src.px;
    const SW = src.w,
      SH = src.h,
      SMASK = src.mask;
    let drew = false;

    for (let ry = 0; ry < rh; ry++) {
      const jf = ry / CELL;
      const j0 = Math.min(rows - 1, jf | 0);
      const fy = jf - j0;
      const rowA = j0 * (cols + 1);
      const rowB = rowA + (cols + 1);
      for (let rx = 0; rx < rw; rx++) {
        const uf = rx / CELL;
        const i0 = Math.min(cols - 1, uf | 0);
        const fx = uf - i0;
        const a = rowA + i0,
          c = rowB + i0;
        if (!ok[a] || !ok[a + 1] || !ok[c] || !ok[c + 1]) continue;

        let mx: number;
        let my: number;
        if (exact[j0 * cols + i0]) {
          const ll = invert([box.x + rx / perCss, box.y + ry / perCss]);
          if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) continue;
          // The lookup masks x into the texture, so a raw turn needs no unwrap.
          mx = (ll[0] + 180) / 360;
          my = (90 - ll[1]) / 180;
        } else {
          const wa = (1 - fx) * (1 - fy),
            wb = fx * (1 - fy),
            wc = (1 - fx) * fy,
            wd = fx * fy;
          mx = nx[a] * wa + nx[a + 1] * wb + nx[c] * wc + nx[c + 1] * wd;
          my = ny[a] * wa + ny[a + 1] * wb + ny[c] * wc + ny[c + 1] * wd;
        }
        if (!(my >= 0) || my >= 1) continue;

        const gX = mx * SW - 0.5;
        const gY = my * SH - 0.5;
        const X0 = Math.floor(gX),
          Y0 = Math.floor(gY);
        const tu = gX - X0,
          tv = gY - Y0;

        const xa = X0 & SMASK, // longitude wraps
          xb = (X0 + 1) & SMASK;
        const ya = Y0 < 0 ? 0 : Y0 > SH - 1 ? SH - 1 : Y0;
        const yb = Y0 + 1 > SH - 1 ? SH - 1 : Y0 + 1;
        const ra = ya * SW,
          rb = yb * SW;

        const o00 = (ra + xa) << 2,
          o10 = (ra + xb) << 2,
          o01 = (rb + xa) << 2,
          o11 = (rb + xb) << 2;
        const w00 = (1 - tu) * (1 - tv),
          w10 = tu * (1 - tv),
          w01 = (1 - tu) * tv,
          w11 = tu * tv;

        const d = (ry * rw + rx) * 4;
        dst[d] = px[o00] * w00 + px[o10] * w10 + px[o01] * w01 + px[o11] * w11;
        dst[d + 1] =
          px[o00 + 1] * w00 + px[o10 + 1] * w10 + px[o01 + 1] * w01 + px[o11 + 1] * w11;
        dst[d + 2] =
          px[o00 + 2] * w00 + px[o10 + 2] * w10 + px[o01 + 2] * w01 + px[o11 + 2] * w11;
        // Every source sample is opaque: the bake fills to both poles.
        dst[d + 3] = 255;
        drew = true;
      }
    }
    if (!drew) return null;
    ctx.putImageData(img, 0, 0);

    if (!interact) {
      const ref = projectRefs(pr);
      this.snap = ref ? { canvas: out, W, H, box, ref } : null;
    }
    return { canvas: out, box };
  }

  private buffer(w: number, h: number, drag: boolean): HTMLCanvasElement {
    let cv = drag ? this.dragBuf : this.buf;
    if (!cv) {
      cv = document.createElement('canvas');
      if (drag) this.dragBuf = cv;
      else this.buf = cv;
    }
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    return cv;
  }

  private scratch(ctx: CanvasRenderingContext2D, w: number, h: number): ImageData {
    const held = this.scratchImg;
    if (held && held.width === w && held.height === h) {
      // Reused, so clear the pixels the sampler skips.
      held.data.fill(0);
      return held;
    }
    const img = ctx.createImageData(w, h);
    this.scratchImg = img;
    return img;
  }

  private load(
    path: string,
    which: 'small' | 'full' | 'equi',
    done: (img: HTMLImageElement) => void,
  ): void {
    if (this.asked[which]) return;
    this.asked[which] = true;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      done(img);
      this.available = true;
      this.onReady();
    };
    img.onerror = () => {
      // Missing or blocked: `ready` goes false, which hides the depth switch.
      if (!this.available) this.absent = true;
      this.onReady();
    };
    img.src = `${this.base}/${path}`;
  }

  // sphereW: the sphere's drawn width in device px.
  private flat(sphereW: number): HTMLImageElement | null {
    const full = sphereW > SMALL_W && !saveData();
    const done = (img: HTMLImageElement) => {
      if (this.flatImg && this.flatImg.width >= img.width) return; // small base landing late
      this.flatImg = img;
      this.flatRef = flatRefs(img.width);
      this.mip = null;
      this.mipW = 0;
    };
    if (full)
      this.load(FLAT, 'full', (img) => {
        this.fullW = img.width;
        done(img);
      });
    else if (!this.flatImg) this.load(FLAT_SMALL, 'small', done);
    return this.flatImg;
  }

  // Decoded to RGBA (~33 MB) on the first globe paint, since the globe samples it
  // per pixel.
  private equirect(): Grid | null {
    this.load(EQUI, 'equi', (img) => {
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const c = cv.getContext('2d', { willReadFrequently: true });
      if (!c) return;
      try {
        c.drawImage(img, 0, 0);
        this.equi = {
          px: c.getImageData(0, 0, img.width, img.height).data,
          w: img.width,
          h: img.height,
          mask: img.width - 1,
        };
      } catch {
        // getImageData throws on a canvas tainted by a raster served without CORS.
        this.absent = true;
      }
    });
    return this.equi;
  }
}

const saveData = (): boolean =>
  !!(navigator as { connection?: { saveData?: boolean } }).connection?.saveData;

const FLAT_PROJ = geoEqualEarth().scale(1).translate([0, 0]);
const [[FLAT_X0, FLAT_Y0], [FLAT_X1]] = geoPath(FLAT_PROJ).bounds({ type: 'Sphere' });
// The sphere's width at scale 1, so its drawn width is this times the scale.
const FLAT_SPAN = FLAT_X1 - FLAT_X0;

// Where the reference points land in the baked raster, which covers the sphere's
// Equal Earth bounding box exactly and is fitted to width.
function flatRefs(width: number): [number, number][] {
  const s = width / FLAT_SPAN;
  return REF.map((ll) => {
    const q = FLAT_PROJ(ll) as [number, number];
    return [(q[0] - FLAT_X0) * s, (q[1] - FLAT_Y0) * s];
  });
}

// screen = g * raster + (dx, dy)
interface Move {
  g: number;
  dx: number;
  dy: number;
}

// Where the REF points land under `pr`, or null if any does not.
function projectRefs(pr: GeoProjection): [number, number][] | null {
  const out: [number, number][] = [];
  for (const ll of REF) {
    const xy = pr(ll);
    if (!xy || !isFinite(xy[0]) || !isFinite(xy[1])) return null;
    out.push([xy[0], xy[1]]);
  }
  return out;
}

// The scale and translate taking the REF points from `was` to where `pr` puts
// them, or null when `pr` is not such a transform of `was`.
function similarity(was: [number, number][], pr: GeoProjection): Move | null {
  const now = projectRefs(pr);
  if (!now) return null;
  const span = Math.hypot(was[1][0] - was[0][0], was[1][1] - was[0][1]);
  if (span < 1) return null;
  const g = Math.hypot(now[1][0] - now[0][0], now[1][1] - now[0][1]) / span;
  if (!(g > 0) || !isFinite(g)) return null;
  const dx = now[0][0] - g * was[0][0];
  const dy = now[0][1] - g * was[0][1];
  for (let i = 1; i < REF.length; i++) {
    const ex = g * was[i][0] + dx - now[i][0];
    const ey = g * was[i][1] + dy - now[i][1];
    if (Math.hypot(ex, ey) > REF_TOL) return null;
  }
  return { g, dx, dy };
}

// Whether the snapshot, moved by `t`, still covers the sphere's on-screen bounds.
function covered(t: Move, s: Snapshot, pr: GeoProjection, W: number, H: number): boolean {
  const now = sphereBox(pr, W, H);
  if (!now) return true;
  const b = s.box;
  return (
    t.g * b.x + t.dx <= now.x + REF_TOL &&
    t.g * b.y + t.dy <= now.y + REF_TOL &&
    t.g * (b.x + b.w) + t.dx >= now.x + now.w - REF_TOL &&
    t.g * (b.y + b.h) + t.dy >= now.y + now.h - REF_TOL
  );
}

// The sphere's on-screen bounds, clipped to the canvas. Null when it is off
// screen entirely, which leaves the sea colour already painted underneath.
function sphereBox(pr: GeoProjection, W: number, H: number): Box | null {
  const b = geoPath(pr).bounds({ type: 'Sphere' });
  const x = Math.max(0, Math.floor(b[0][0]));
  const y = Math.max(0, Math.floor(b[0][1]));
  const w = Math.min(W, Math.ceil(b[1][0])) - x;
  const h = Math.min(H, Math.ceil(b[1][1])) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}
