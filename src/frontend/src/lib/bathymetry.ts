import { geoPath, type GeoProjection } from 'd3-geo';
import type { Pal } from './palette';

const TILE = 512;
const TILE_SH = 9;
const TILE_MASK = TILE - 1;
const MAX_Z = 5;

const LAT_MAX = 85.0511287798;

const CELL = 8;

const BUDGET_IDLE = 1_200_000;
const BUDGET_DRAG = 500_000;

const CACHE_MAX = 32;

const MAX_TILES = 24;

const REF: [number, number][] = [
  [0, 0],
  [60, 0],
  [0, 45],
];

const REF_TOL = 0.5;

const BLUR_MAX = 1;
const BLUR_TO = 3;

interface Snapshot {
  canvas: HTMLCanvasElement;
  W: number;
  H: number;
  ref: [number, number][];
}

interface Tile {
  px: Uint8ClampedArray | null;
  used: number;
}

export class Bathymetry {
  private tiles = new Map<string, Tile>();
  private clock = 0;
  private buf: HTMLCanvasElement | null = null;
  private dragBuf: HTMLCanvasElement | null = null;
  private snap: Snapshot | null = null;
  private decoder: CanvasRenderingContext2D | null = null;

  available = false;
  private absent = false;

  constructor(
    private base: string,
    private onTile: () => void,
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
    this.tiles.clear();
    this.snap = null;
    this.dragBuf = null;
    this.buf = null;
    this.decoder = null;
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
    const soft = calm(pr, W);
    if (soft > 0.05) ctx.filter = `blur(${soft.toFixed(2)}px)`;

    if (interact) {
      const keep = this.snap;
      const t = keep && keep.W === W && keep.H === H ? similarity(keep.ref, pr) : null;
      if (keep && t && covered(t, keep, pr, W, H)) {
        ctx.drawImage(keep.canvas, t.dx, t.dy, t.g * keep.W, t.g * keep.H);
        ctx.filter = 'none';
        return;
      }
    }
    const raster = this.reproject(pr, W, H, globe, interact, dpr);
    if (raster) ctx.drawImage(raster, 0, 0, W, H);
    ctx.filter = 'none';
  }

  private reproject(
    pr: GeoProjection,
    W: number,
    H: number,
    globe: boolean,
    interact: boolean,
    dpr: number,
  ): HTMLCanvasElement | null {
    const invert = pr.invert;
    if (!invert) return null;

    if (!interact) this.snap = null;

    const dw = W * dpr,
      dh = H * dpr;
    const budget = interact ? BUDGET_DRAG : BUDGET_IDLE;
    const scale = Math.min(1, Math.sqrt(budget / Math.max(1, dw * dh)));
    const rw = Math.max(2, Math.round(dw * scale));
    const rh = Math.max(2, Math.round(dh * scale));
    const perCss = rw / W;

    const cols = Math.ceil(rw / CELL);
    const rows = Math.ceil(rh / CELL);
    const nodes = (cols + 1) * (rows + 1);
    const nx = new Float64Array(nodes);
    const ny = new Float64Array(nodes);
    const ok = new Uint8Array(nodes);

    let lo = Infinity,
      hi = -Infinity,
      top = Infinity,
      bot = -Infinity;
    let rowStart = 0;
    for (let j = 0; j <= rows; j++) {
      const y = (j * CELL) / perCss;
      let prev = NaN;
      let first = NaN;
      for (let i = 0; i <= cols; i++) {
        const x = (i * CELL) / perCss;
        const k = j * (cols + 1) + i;
        const ll = invert([x, y]);
        if (!ll || !isFinite(ll[0]) || !isFinite(ll[1]) || Math.abs(ll[1]) > LAT_MAX) {
          ok[k] = 0;
          continue;
        }
        let u = (ll[0] + 180) / 360;
        const phi = (ll[1] * Math.PI) / 180;
        const v = 0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI);
        if (isFinite(prev)) u -= Math.round(u - prev);
        else if (isFinite(rowStart)) u -= Math.round(u - rowStart);
        if (!isFinite(first)) first = u;
        prev = u;
        nx[k] = u;
        ny[k] = v;
        ok[k] = 1;
        if (u < lo) lo = u;
        if (u > hi) hi = u;
        if (v < top) top = v;
        if (v > bot) bot = v;
      }
      if (isFinite(first)) rowStart = first;
    }
    if (!isFinite(lo)) return null;

    const b = geoPath(pr).bounds({ type: 'Sphere' });
    const dia = Math.max(1, b[1][0] - b[0][0]);
    const worldPx = (globe ? Math.PI * dia : dia) * perCss;
    let z = Math.max(0, Math.min(MAX_Z, Math.round(Math.log2(worldPx / TILE))));

    let n = 1 << z;
    while (z > 0 && tileCount(lo, hi, top, bot, n) > MAX_TILES) {
      z--;
      n = 1 << z;
    }

    const px: (Uint8ClampedArray | null)[] = new Array(n * n).fill(null);
    const x0 = Math.floor(lo * n),
      x1 = Math.floor(hi * n);
    const y0 = Math.max(0, Math.floor(top * n)),
      y1 = Math.min(n - 1, Math.floor(bot * n));
    for (let tx = x0; tx <= x1; tx++) {
      const wrapped = ((tx % n) + n) % n;
      for (let ty = y0; ty <= y1; ty++) {
        px[wrapped * n + ty] = this.want(z, wrapped, ty);
      }
    }

    const out = this.buffer(rw, rh, interact);
    if (!out) return null;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const img = ctx.createImageData(rw, rh);
    const dst = img.data;

    const WORLD = n * TILE;
    const WMASK = WORLD - 1;

    let lastIdx = -1;
    let lastPx: Uint8ClampedArray | null = null;
    let drew = false;

    let base = 0;
    let ar = 0,
      ag = 0,
      ab = 0;
    const tap = (X: number, Y: number, w: number): void => {
      const wx = X & WMASK;
      const wy = Y < 0 ? 0 : Y > WMASK ? WMASK : Y;
      const t = px[(wx >> TILE_SH) * n + (wy >> TILE_SH)];
      const src = t ?? (lastPx as Uint8ClampedArray);
      const o = t ? (((wy & TILE_MASK) << TILE_SH) + (wx & TILE_MASK)) << 2 : base;
      ar += src[o] * w;
      ag += src[o + 1] * w;
      ab += src[o + 2] * w;
    };

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
        const gX = mx * WORLD - 0.5;
        const gY = my * WORLD - 0.5;
        const X0 = Math.floor(gX),
          Y0 = Math.floor(gY);
        const tu = gX - X0,
          tv = gY - Y0;
        const ax = X0 & WMASK;
        const ay = Y0 < 0 ? 0 : Y0 > WMASK ? WMASK : Y0;

        const idx = (ax >> TILE_SH) * n + (ay >> TILE_SH);
        if (idx !== lastIdx) {
          lastIdx = idx;
          lastPx = px[idx];
        }
        if (!lastPx) continue;

        const cx = ax & TILE_MASK,
          cy = ay & TILE_MASK;
        base = ((cy << TILE_SH) + cx) << 2;
        const w00 = (1 - tu) * (1 - tv),
          w10 = tu * (1 - tv),
          w01 = (1 - tu) * tv,
          w11 = tu * tv;
        const d = (v * rw + u) * 4;
        if (cx !== TILE_MASK && cy !== TILE_MASK) {
          const e = base + 4;
          const f = base + (TILE << 2);
          const g = f + 4;
          dst[d] = lastPx[base] * w00 + lastPx[e] * w10 + lastPx[f] * w01 + lastPx[g] * w11;
          dst[d + 1] =
            lastPx[base + 1] * w00 +
            lastPx[e + 1] * w10 +
            lastPx[f + 1] * w01 +
            lastPx[g + 1] * w11;
          dst[d + 2] =
            lastPx[base + 2] * w00 +
            lastPx[e + 2] * w10 +
            lastPx[f + 2] * w01 +
            lastPx[g + 2] * w11;
        } else {
          ar = ag = ab = 0;
          tap(X0, Y0, w00);
          tap(X0 + 1, Y0, w10);
          tap(X0, Y0 + 1, w01);
          tap(X0 + 1, Y0 + 1, w11);
          dst[d] = ar;
          dst[d + 1] = ag;
          dst[d + 2] = ab;
        }
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
      this.snap = ref.length === REF.length ? { canvas: out, W, H, ref } : null;
    }
    return out;
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

  private want(z: number, x: number, y: number): Uint8ClampedArray | null {
    const key = `${z}/${x}/${y}`;
    const held = this.tiles.get(key);
    if (held) {
      held.used = ++this.clock;
      return held.px;
    }

    const entry: Tile = { px: null, used: ++this.clock };
    this.tiles.set(key, entry);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      entry.px = this.decode(img);
      if (entry.px) {
        this.available = true;
        this.evict();
        this.onTile();
      }
    };
    img.onerror = () => {
      if (!this.available) this.absent = true;
    };
    img.src = `${this.base}/tiles/${key}.jpg`;
    return null;
  }

  private decode(img: HTMLImageElement): Uint8ClampedArray | null {
    if (!this.decoder) {
      if (typeof document === 'undefined') return null;
      const cv = document.createElement('canvas');
      cv.width = TILE;
      cv.height = TILE;
      this.decoder = cv.getContext('2d', { willReadFrequently: true });
    }
    const ctx = this.decoder;
    if (!ctx) return null;
    try {
      ctx.clearRect(0, 0, TILE, TILE);
      ctx.drawImage(img, 0, 0, TILE, TILE);
      return ctx.getImageData(0, 0, TILE, TILE).data;
    } catch {
      this.absent = true;
      return null;
    }
  }

  private evict(): void {
    if (this.tiles.size <= CACHE_MAX) return;
    const byAge = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [key] of byAge.slice(0, this.tiles.size - CACHE_MAX)) this.tiles.delete(key);
  }
}

function calm(pr: GeoProjection, W: number): number {
  const b = geoPath(pr).bounds({ type: 'Sphere' });
  const dia = Math.max(1, b[1][0] - b[0][0]);
  const t = Math.min(1, Math.max(0, (dia / W - 1) / (BLUR_TO - 1)));
  return BLUR_MAX * (1 - t);
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
  const b = geoPath(pr).bounds({ type: 'Sphere' });
  const nx0 = Math.max(0, b[0][0]),
    ny0 = Math.max(0, b[0][1]),
    nx1 = Math.min(W, b[1][0]),
    ny1 = Math.min(H, b[1][1]);
  if (nx1 <= nx0 || ny1 <= ny0) return true;
  return (
    t.dx <= nx0 + REF_TOL &&
    t.dy <= ny0 + REF_TOL &&
    t.g * s.W + t.dx >= nx1 - REF_TOL &&
    t.g * s.H + t.dy >= ny1 - REF_TOL
  );
}

function tileCount(lo: number, hi: number, top: number, bot: number, n: number): number {
  const across = Math.floor(hi * n) - Math.floor(lo * n) + 1;
  const down = Math.min(n - 1, Math.floor(bot * n)) - Math.max(0, Math.floor(top * n)) + 1;
  return Math.max(1, across) * Math.max(1, down);
}
