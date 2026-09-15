/**
 * The water layer: the page ground, the sea, and — where we have them — GEBCO
 * depth tiles reprojected onto whichever projection the stage is showing.
 *
 * The page rect and the sea disc used to be two nodes in the basemap SVG. They
 * moved here because the raster has to sit between them and the land, and one
 * SVG cannot be interleaved with a canvas. So this canvas owns the water and the
 * SVG above it owns the ink. With no tiles the result is pixel-for-pixel what
 * the two nodes drew, which is what makes an empty /tiles/ a valid deployment
 * rather than a broken one.
 *
 * The tiles are Web Mercator and the stage is Natural Earth or orthographic, so
 * the raster cannot simply be drawn: every destination pixel has to be sampled
 * from the source through the projection's inverse. Inverting per pixel is far
 * too slow to drag with, so the inverse is evaluated on a coarse lattice and
 * interpolated across each cell — over an 8px cell the error stays well under a
 * pixel, and the whole pass costs a few thousand inversions instead of a
 * million.
 *
 * Tiles are fetched from our own origin: nginx serves /tiles/ in the image and
 * vite does the same in dev. Nothing here contacts a tile service.
 */
import { geoPath, type GeoProjection } from 'd3-geo';
import type { Pal } from './palette';

/** Matches scripts/build-tiles.mjs: 512px JPEG, `just map::tiles` writes z0-5. */
const TILE = 512;
const MAX_Z = 5;

/** Web Mercator stops here; the sliver of Arctic beyond it stays flat sea. */
const LAT_MAX = 85.0511287798;

/** Lattice spacing for the inverse, in raster pixels. */
const CELL = 8;

/**
 * Destination pixels per pass. The raster is drawn into an offscreen buffer of
 * this many pixels and scaled up, rather than at the stage's own size: depth is
 * a smooth gradient, it is covered by the land and the pins, and a budget keeps
 * the cost of a pass the same on a laptop and on a 5K display. The lower figure
 * is for a hand still on the map, where 36ms is the whole frame.
 *
 * DEVICE pixels, which is what the canvas is sized in. Counting the stage's CSS
 * pixels instead quietly multiplied the upscale by the pixel ratio, so the same
 * budget that looked soft on a 1x laptop looked blocky on a retina display.
 *
 * The idle figure also holds the tile count down: a raster of this area needs
 * about sixteen tiles, inside MAX_TILES with room to spare. Raise it much and
 * the pass trips that cap instead, which steps the source zoom back down and
 * gives back exactly the sharpness the bigger buffer was for.
 */
const BUDGET_IDLE = 1_200_000;
const BUDGET_DRAG = 500_000;

/**
 * Decoded tiles held, at 1 MB each — this is the layer's whole memory budget,
 * and the widget is embedded on someone else's page, so it stays modest. A view
 * at a matched zoom needs about nine, so there is room to pan before anything is
 * evicted and re-fetched.
 */
const CACHE_MAX = 32;

/** Tiles one pass may ask for; over this the source zoom steps down instead. */
const MAX_TILES = 24;

/**
 * Three lon/lat the re-use test measures a view against — see `similarity`.
 * Any three that are not collinear will do; these are all on the near side of
 * the flat map, so a pan never puts them behind the globe by accident.
 */
const REF: [number, number][] = [
  [0, 0],
  [60, 0],
  [0, 45],
];

/** How far, in pixels, a reference point may miss before a view counts as
    reshaped rather than merely panned or zoomed. */
const REF_TOL = 0.5;

/**
 * A finished full-quality pass, kept so that a pan or a zoom can re-use it.
 * `ref` is where REF landed when it was drawn, which is all the re-use test
 * needs: it never has to know which projection made it.
 */
interface Snapshot {
  canvas: HTMLCanvasElement;
  W: number;
  H: number;
  ref: [number, number][];
}

interface Tile {
  /** RGBA of a decoded tile, or null while it is loading or after it failed. */
  px: Uint8ClampedArray | null;
  used: number;
}

export class Bathymetry {
  private tiles = new Map<string, Tile>();
  private clock = 0;
  /** Two buffers, not one: the settled pass has to survive being read back
      while a drag renders into its own. */
  private buf: HTMLCanvasElement | null = null;
  private dragBuf: HTMLCanvasElement | null = null;
  private snap: Snapshot | null = null;
  private decoder: CanvasRenderingContext2D | null = null;

  /** True once a tile has decoded: the attribution and the switch wait for it. */
  available = false;
  /** Set when the first request fails before anything has ever loaded — the
      deployment has no tiles mounted, so stop asking and stay flat. */
  private absent = false;

  /**
   * @param base   origin serving /tiles/, '' for this page's own.
   * @param onTile called when a tile lands and the stage should repaint.
   */
  constructor(
    private base: string,
    private onTile: () => void,
  ) {}

  /** Whether a pass would draw anything. */
  get ready(): boolean {
    return this.available && !this.absent;
  }

  /**
   * Paints ground, sea and — if `depth` and we have tiles — the reprojected
   * raster. `ctx` is expected to be scaled for the device pixel ratio already.
   */
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
      /* The sphere is still the current path, so it clips the raster to the
         map's own outline — the globe's rim included, exactly. */
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      this.overlay(ctx, pr, W, H, globe, interact, dpr);
    }
    ctx.restore();
  }

  /** Drops every decoded tile. The stage calls this on destroy. */
  clear(): void {
    this.tiles.clear();
    this.snap = null;
    this.dragBuf = null;
    this.buf = null;
    this.decoder = null;
  }

  /* ---------- drawing ---------- */

  /**
   * Draws the depth raster into the already-clipped context.
   *
   * A hand on the map gets the settled pass back, moved, wherever that is
   * possible. Re-projecting into the smaller buffer a drag can afford means
   * sampling a coarser level of the pyramid, and at world scale the coarse
   * levels are genuinely crude — one 512px tile for the whole Earth at z0. No
   * budget fixes that, because the budget is what causes it.
   *
   * Moving the settled pass instead costs one drawImage and keeps its
   * sharpness. It works because a pan or a zoom of the flat map is a similarity
   * in screen space: d3 projections apply `scale` and `translate` last, so
   * changing S.k, S.tx or S.ty moves every pixel the same way. Rotating the
   * globe is not, and `similarity` says so rather than assuming.
   */
  private overlay(
    ctx: CanvasRenderingContext2D,
    pr: GeoProjection,
    W: number,
    H: number,
    globe: boolean,
    interact: boolean,
    dpr: number,
  ): void {
    if (interact) {
      const keep = this.snap;
      const t = keep && keep.W === W && keep.H === H ? similarity(keep.ref, pr) : null;
      if (keep && t && covered(t, keep, pr, W, H)) {
        ctx.drawImage(keep.canvas, t.dx, t.dy, t.g * keep.W, t.g * keep.H);
        return;
      }
    }
    const raster = this.reproject(pr, W, H, globe, interact, dpr);
    if (raster) ctx.drawImage(raster, 0, 0, W, H);
  }

  /* ---------- the reprojection ---------- */

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

    /* Dropped up front and only restored on success. The snapshot describes
       whatever is in the settled buffer right now, and this pass is about to
       resize or overwrite it — a pass that then bails would otherwise leave a
       description of pixels that are no longer there. */
    if (!interact) this.snap = null;

    const dw = W * dpr,
      dh = H * dpr;
    const budget = interact ? BUDGET_DRAG : BUDGET_IDLE;
    const scale = Math.min(1, Math.sqrt(budget / Math.max(1, dw * dh)));
    const rw = Math.max(2, Math.round(dw * scale));
    const rh = Math.max(2, Math.round(dh * scale));
    /* Raster pixels per CSS pixel: what turns a stage coordinate into a lattice
       one, and what the source zoom below has to match. */
    const perCss = rw / W;

    const cols = Math.ceil(rw / CELL);
    const rows = Math.ceil(rh / CELL);
    const nodes = (cols + 1) * (rows + 1);
    const nx = new Float64Array(nodes);
    const ny = new Float64Array(nodes);
    const ok = new Uint8Array(nodes);

    /* The lattice, in Mercator's unit square rather than in degrees: it is what
       the sampling loop wants, and interpolating it avoids a second conversion
       per pixel. */
    let lo = Infinity,
      hi = -Infinity,
      top = Infinity,
      bot = -Infinity;
    let rowStart = 0;
    for (let j = 0; j <= rows; j++) {
      /* i*CELL rather than a position clamped to the raster's edge: the
         interpolation below assumes the nodes are CELL apart, and a short last
         cell would shift its pixels by up to half a cell. The inverse is just as
         defined a few pixels past the edge, and the sphere clips it anyway. */
      const y = (j * CELL) / perCss;
      /* Each row is unwrapped to be continuous across the antimeridian, then
         aligned to the row above it, so a cell never blends a longitude near
         +180 with one near -180 and smears the whole Pacific into one column.
         Sampling takes nx modulo 1, so the integer part is free to run. */
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

    /* Source zoom: match the tiles' resolution to the RASTER's, not the stage's.
       The two differ by `perCss`, and picking for the stage while sampling into a
       smaller buffer means point-sampling a source finer than the destination —
       which aliases, and the upscale afterwards magnifies exactly that into the
       blockiness a drag used to show.

       The flat map's sphere bounds are a full turn of longitude; the globe shows
       a hemisphere across its diameter, which is half a turn, so a whole turn is
       pi times the radius on each side. */
    const b = geoPath(pr).bounds({ type: 'Sphere' });
    const dia = Math.max(1, b[1][0] - b[0][0]);
    const worldPx = (globe ? Math.PI * dia : dia) * perCss;
    let z = Math.max(0, Math.min(MAX_Z, Math.round(Math.log2(worldPx / TILE))));

    /* A wide view at a fine zoom would ask for hundreds of tiles; one step
       coarser quarters that, and on a map this size it is not visible. */
    let n = 1 << z;
    while (z > 0 && tileCount(lo, hi, top, bot, n) > MAX_TILES) {
      z--;
      n = 1 << z;
    }

    /* Indexed by tile rather than looked up by key: the sampling loop runs
       millions of times and a string per pixel would dominate it. */
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

    let lastIdx = -1;
    let lastPx: Uint8ClampedArray | null = null;
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

        const gy = my * n;
        const ty = Math.floor(gy);
        if (ty < 0 || ty >= n) continue;
        const gx = mx * n;
        const fxi = Math.floor(gx);
        const tx = ((fxi % n) + n) % n;

        const idx = tx * n + ty;
        if (idx !== lastIdx) {
          lastIdx = idx;
          lastPx = px[idx];
        }
        if (!lastPx) continue;

        const sx = ((gx - fxi) * TILE) | 0;
        const sy = ((gy - ty) * TILE) | 0;
        const s = (sy * TILE + sx) * 4;
        const d = (v * rw + u) * 4;
        dst[d] = lastPx[s];
        dst[d + 1] = lastPx[s + 1];
        dst[d + 2] = lastPx[s + 2];
        dst[d + 3] = 255;
        drew = true;
      }
    }
    if (!drew) return null;
    ctx.putImageData(img, 0, 0);

    /* Only a settled pass is worth keeping: re-using a drag's own reduced buffer
       would hand the next frame something already softened. */
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

  /** The offscreen the raster is built in, re-sized only when it has to be.
      A drag gets its own, so a fresh interactive pass cannot scribble over the
      settled one it may be asked to re-use a frame later. */
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

  /* ---------- tiles ---------- */

  /** The decoded tile if we have it, and a request for it if we do not. */
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
    /* Same-origin in both deployments, so this changes nothing there. It makes
       a cross-origin /tiles/ fail its load rather than taint the canvas the
       sampling loop has to read back — a clean fall back to flat sea instead of
       a SecurityError on the first pass. */
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
      /* The entry stays, holding no pixels. Deleting it would let the next pass
         ask again, and a pyramid built to a lower zoom than MAX_Z would then
         re-request the same 404s on every pan for as long as the map is open.
         Eviction eventually clears it, which is the retry. */
      /* Nothing has ever loaded: there are no tiles mounted at all. Stop asking. */
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
      /* A tainted canvas: the tiles are cross-origin without CORS. */
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

/** A uniform scale and a shift: what a pan or a zoom does to every pixel. */
interface Move {
  g: number;
  dx: number;
  dy: number;
}

/**
 * The move that carries a snapshot's view onto the current one, or null if no
 * single move does.
 *
 * Derived from where the reference points are now rather than from the two
 * projections' internals, so it needs to know nothing about fitExtent's margins
 * or which projection is in play — and it stays right if either ever changes.
 * Two points fix the scale and the shift; the third is the check that the view
 * really was only panned or zoomed. A rotated globe fails it, as does a
 * reshaped stage, and both then fall through to a fresh pass.
 */
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
  /* Every point, not just the spare one: an equal distance can also be reached
     by a rotation or a mirror, which would smear the raster rather than move it. */
  for (let i = 1; i < REF.length; i++) {
    const ex = g * was[i][0] + dx - now[i][0];
    const ey = g * was[i][1] + dy - now[i][1];
    if (Math.hypot(ex, ey) > REF_TOL) return null;
  }
  return { g, dx, dy };
}

/**
 * Whether the moved snapshot still reaches everything the map is about to draw.
 *
 * Only the sphere matters, not the whole stage: outside it the raster is
 * clipped away. Zoomed out that is what makes a pan free — the sphere travels
 * with the snapshot, so nothing new is ever exposed. Zoomed in far enough that
 * the sphere overflows the stage, a pan does expose new ground, this returns
 * false, and the pass is re-projected as before.
 */
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

/** Tiles a lattice's extent covers at 2^z per side. */
function tileCount(lo: number, hi: number, top: number, bot: number, n: number): number {
  const across = Math.floor(hi * n) - Math.floor(lo * n) + 1;
  const down = Math.min(n - 1, Math.floor(bot * n)) - Math.max(0, Math.floor(top * n)) + 1;
  return Math.max(1, across) * Math.max(1, down);
}
