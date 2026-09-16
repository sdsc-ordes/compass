import { geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo';
import type { Pal } from './palette';

// Two baked rasters replace the old z0-z5 tile pyramid (scripts/build-bathymetry.mjs).
//
// Flat view: geoNaturalEarth1 only ever varies by scale and translate, so every
// pan and zoom is an exact similarity transform of one fixed image -- a single
// drawImage, no per-pixel work at all.
//
// Globe view: rotation is the one transform that is not affine, so it still
// resamples per frame, but from one contiguous equirectangular buffer rather
// than a patchwork of tiles.
//
// Detail level: the flat view upscales the base past 1:1 from about k=4, so a 2x
// raster is fetched on top of it there, tiled and only where the viewport looks.
const FLAT = 'bathy/flat.webp';
const EQUI = 'bathy/equirect.webp';
const DETAIL = 'bathy/d';

// 2x the base, cut into tiles because WebP caps a side at 16383.
const DETAIL_SCALE = 2;
const DETAIL_TILE = 2048;

// Never decoded, only drawImage'd, so each is a GPU texture rather than 16 MB of
// ImageData. A viewport spans about 2x2 of them; this is room to pan.
const DETAIL_KEEP = 12;

const LAT_MAX = 85.0511287798;

const CELL = 8;

// Once the globe settles we rasterise near the device resolution: the old
// budget upscaled ~2x into the canvas, which is what made the globe soft.
// Paid once on settle, never during a drag -- that keeps BUDGET_DRAG.
const BUDGET_IDLE = 2_800_000;
const BUDGET_DRAG = 500_000;

const REF: [number, number][] = [
  [0, 0],
  [60, 0],
  [0, 45],
];

const REF_TOL = 0.5;

// Below this fraction of the source width, downscale once into a mip rather than
// making the compositor rescale all 35M source pixels on every frame.
const MIP_AT = 0.5;

interface Snapshot {
  canvas: HTMLCanvasElement;
  W: number;
  H: number;
  box: Box;
  ref: [number, number][];
}

// The screen rect a raster covers. The globe is a disc in a wider canvas, so
// rasterising the whole canvas spends up to half the budget on pixels that are
// not the sphere; confining it to these bounds buys ~1:1 for the same cost.
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
  mask: number;
}

export class Bathymetry {
  private flatImg: HTMLImageElement | null = null;
  private flatRef: [number, number][] | null = null;
  private mip: HTMLCanvasElement | null = null;
  private mipW = 0;

  private equi: Grid | null = null;
  private asked = { flat: false, equi: false };

  // Insertion order is the LRU. A null value means asked for and not here yet --
  // or never coming, for a tile the bake left out as entirely off the sphere.
  private det = new Map<string, HTMLImageElement | null>();

  private buf: HTMLCanvasElement | null = null;
  private dragBuf: HTMLCanvasElement | null = null;
  private snap: Snapshot | null = null;
  private img: ImageData | null = null;

  available = false;
  private absent = false;

  constructor(
    private base: string,
    private onReady: () => void,
  ) {}

  get ready(): boolean {
    return this.available && !this.absent;
  }

  paint(
    ctx: CanvasRenderingContext2D,
    pr: GeoProjection,
    W: number,
    H: number,
    p: Pal,
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
    this.img = null;
    this.mip = null;
    this.mipW = 0;
    this.det.clear();
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
      this.blit(ctx, pr, W, H);
      return;
    }

    if (interact) {
      const keep = this.snap;
      const t = keep && keep.W === W && keep.H === H ? similarity(keep.ref, pr) : null;
      if (keep && t && covered(t, keep, pr, W, H)) {
        const b = keep.box;
        ctx.drawImage(keep.canvas, t.g * b.x + t.dx, t.g * b.y + t.dy, t.g * b.w, t.g * b.h);
        return;
      }
    }
    const out = this.reproject(pr, W, H, interact, dpr);
    if (out) ctx.drawImage(out.canvas, out.box.x, out.box.y, out.box.w, out.box.h);
  }

  // Flat view: one drawImage of the pre-projected raster.
  private blit(ctx: CanvasRenderingContext2D, pr: GeoProjection, W: number, H: number): void {
    const img = this.flat();
    const ref = this.flatRef;
    if (!img || !ref) return;

    const t = similarity(ref, pr);
    if (!t) return;

    const dw = t.g * img.width;
    const dh = t.g * img.height;
    ctx.drawImage(this.level(img, dw), t.dx, t.dy, dw, dh);
    // Always underneath: a tile still in flight, or one the bake skipped, just
    // leaves the base showing rather than a hole.
    if (dw > img.width) this.detail(ctx, t, img.width, img.height, W, H);
  }

  // Same similarity, half the gain: the base maps basePx -> g*basePx + d, so the
  // 2x level maps detailPx -> (g/2)*detailPx + d.
  private detail(
    ctx: CanvasRenderingContext2D,
    t: Move,
    baseW: number,
    baseH: number,
    W: number,
    H: number,
  ): void {
    const g = t.g / DETAIL_SCALE;
    const span = g * DETAIL_TILE;
    const cols = Math.ceil((baseW * DETAIL_SCALE) / DETAIL_TILE);
    const rows = Math.ceil((baseH * DETAIL_SCALE) / DETAIL_TILE);

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
    const held = this.det.get(key);
    if (held !== undefined) {
      if (held) {
        this.det.delete(key); // re-insert: youngest again
        this.det.set(key, held);
      }
      return held;
    }
    if (typeof document === 'undefined') return null;

    this.det.set(key, null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      this.det.set(key, img);
      this.evict();
      this.onReady();
    };
    // 404 is the normal answer for a tile wholly outside the sphere, so the null
    // stands and nothing asks again.
    img.onerror = () => {};
    img.src = `${this.base}/${DETAIL}/${key}.webp`;
    return null;
  }

  // Nulls are cheap and must survive, or a missing tile would be re-requested
  // every frame; only decoded images are worth evicting.
  private evict(): void {
    let live = 0;
    for (const img of this.det.values()) if (img) live++;
    for (const [k, img] of this.det) {
      if (live <= DETAIL_KEEP) return;
      if (!img) continue;
      this.det.delete(k);
      live--;
    }
  }

  // The baked raster is far wider than the stage at normal zoom. Rescaling all of
  // it every frame is the one way this path could cost more than it saves, so
  // hold a downscaled copy and rebuild it only when the zoom bucket changes.
  private level(img: HTMLImageElement, drawW: number): CanvasImageSource {
    if (drawW >= img.width * MIP_AT) return img;
    const want = 1 << Math.ceil(Math.log2(Math.max(64, drawW)));
    if (this.mip && this.mipW === want) return this.mip;

    const h = Math.max(1, Math.round((want * img.height) / img.width));
    const cv = this.mip && this.mipW !== want ? this.mip : document.createElement('canvas');
    cv.width = want;
    cv.height = h;
    const c = cv.getContext('2d');
    if (!c) return img;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.clearRect(0, 0, want, h);
    c.drawImage(img, 0, 0, want, h);
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
        if (!ll || !isFinite(ll[0]) || !isFinite(ll[1]) || Math.abs(ll[1]) > LAT_MAX) {
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

    const out = this.buffer(rw, rh, interact);
    if (!out) return null;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    const img = this.scratch(ctx, rw, rh);
    const dst = img.data;

    const px = src.px;
    const SW = src.w,
      SH = src.h,
      SMASK = src.mask;
    let drew = false;

    for (let v = 0; v < rh; v++) {
      const jf = v / CELL;
      const j0 = Math.min(rows - 1, jf | 0);
      const fy = jf - j0;
      const rowA = j0 * (cols + 1);
      const rowB = rowA + (cols + 1);
      for (let u = 0; u < rw; u++) {
        const uf = u / CELL;
        const i0 = Math.min(cols - 1, uf | 0);
        const fx = uf - i0;
        const a = rowA + i0,
          c = rowB + i0;
        if (!ok[a] || !ok[a + 1] || !ok[c] || !ok[c + 1]) continue;

        const wa = (1 - fx) * (1 - fy),
          wb = fx * (1 - fy),
          wc = (1 - fx) * fy,
          wd = fx * fy;
        const mx = nx[a] * wa + nx[a + 1] * wb + nx[c] * wc + nx[c + 1] * wd;
        const my = ny[a] * wa + ny[a + 1] * wb + ny[c] * wc + ny[c + 1] * wd;
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
        const yb = Y0 + 1 > SH - 1 ? SH - 1 : Y0 + 1 < 0 ? 0 : Y0 + 1;
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

        const d = (v * rw + u) * 4;
        dst[d] = px[o00] * w00 + px[o10] * w10 + px[o01] * w01 + px[o11] * w11;
        dst[d + 1] =
          px[o00 + 1] * w00 + px[o10 + 1] * w10 + px[o01 + 1] * w01 + px[o11 + 1] * w11;
        dst[d + 2] =
          px[o00 + 2] * w00 + px[o10 + 2] * w10 + px[o01 + 2] * w01 + px[o11 + 2] * w11;
        // The bake carries the raster to both poles, so every sample is opaque and
        // interpolating alpha would be four multiplies to arrive back at 255.
        dst[d + 3] = 255;
        drew = true;
      }
    }
    if (!drew) return null;
    ctx.putImageData(img, 0, 0);

    if (!interact) {
      const ref: [number, number][] = [];
      for (const ll of REF) {
        const xy = pr(ll);
        if (!xy || !isFinite(xy[0]) || !isFinite(xy[1])) {
          ref.length = 0;
          break;
        }
        ref.push([xy[0], xy[1]]);
      }
      this.snap = ref.length === REF.length ? { canvas: out, W, H, box, ref } : null;
    }
    return { canvas: out, box };
  }

  private buffer(w: number, h: number, drag: boolean): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
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
    const held = this.img;
    if (held && held.width === w && held.height === h) {
      // Carried over from the last frame, so wipe the pixels the loop leaves alone.
      held.data.fill(0);
      return held;
    }
    const img = ctx.createImageData(w, h);
    this.img = img;
    return img;
  }

  private load(
    path: string,
    seen: 'flat' | 'equi',
    done: (img: HTMLImageElement) => void,
  ): void {
    if (this.asked[seen] || typeof document === 'undefined') return;
    this.asked[seen] = true;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      done(img);
      this.available = true;
      this.onReady();
    };
    img.onerror = () => {
      if (!this.available) this.absent = true;
    };
    img.src = `${this.base}/${path}`;
  }

  private flat(): HTMLImageElement | null {
    this.load(FLAT, 'flat', (img) => {
      this.flatImg = img;
      this.flatRef = flatRefs(img.width);
    });
    return this.flatImg;
  }

  // Decoded once into a 4096x2048 RGBA buffer (~33 MB) because the globe samples
  // it per pixel. Only paid for if the globe is actually used.
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
        this.absent = true;
      }
    });
    return this.equi;
  }
}

// Where the reference points land in the baked raster, which covers the sphere's
// Natural Earth bounding box exactly and is fitted to width.
function flatRefs(width: number): [number, number][] {
  const base = geoNaturalEarth1().scale(1).translate([0, 0]);
  const [[x0, y0], [x1]] = geoPath(base).bounds({ type: 'Sphere' });
  const s = width / (x1 - x0);
  return REF.map((ll) => {
    const q = base(ll) as [number, number];
    return [(q[0] - x0) * s, (q[1] - y0) * s];
  });
}

interface Move {
  g: number;
  dx: number;
  dy: number;
}

function similarity(was: [number, number][], pr: GeoProjection): Move | null {
  const now: [number, number][] = [];
  for (const ll of REF) {
    const xy = pr(ll);
    if (!xy || !isFinite(xy[0]) || !isFinite(xy[1])) return null;
    now.push([xy[0], xy[1]]);
  }
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
