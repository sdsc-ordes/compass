import {
  geoBounds,
  geoDistance,
  geoEqualEarth,
  geoOrthographic,
  type GeoProjection,
} from 'd3-geo';
import type { Theme } from './palette';

export interface ViewState {
  view: 'flat' | 'globe';
  theme: Theme;
  rot: [number, number];
  k: number;
  tx: number;
  ty: number;
  // Per-stage zoom ceiling; K_MAX unless a small screen raises it.
  kMax: number;
  ready: boolean;
}

export const K_MIN = 1;
export const K_MAX = 9;
// Zoom factor of one zoom-button press.
export const ZOOM_BTN = 1.6;

export const initialView = (): ViewState => ({
  view: 'flat',
  theme: 'light',
  rot: [-18, -8],
  k: 1,
  tx: 0,
  ty: 0,
  kMax: K_MAX,
  ready: false,
});

// The k = 1 cameras. Every flat camera is flatBase scaled about the origin and
// translated, so fitting one is a ratio rather than a search.
const flatBase = (w: number, h: number): GeoProjection =>
  geoEqualEarth().fitExtent(
    [
      [10, 18],
      [w - 10, h - 18],
    ],
    { type: 'Sphere' },
  );

const globeBase = (w: number, h: number): GeoProjection =>
  geoOrthographic().fitExtent(
    [
      [24, 24],
      [w - 24, h - 24],
    ],
    { type: 'Sphere' },
  );

/** Build the projection for view state `S` on a w x h stage. */
export function proj(S: ViewState, w: number, h: number): GeoProjection {
  if (S.view === 'globe') {
    const p = globeBase(w, h).rotate(S.rot);
    return p.scale(p.scale() * S.k).translate([w / 2, h / 2]);
  }
  const p = flatBase(w, h);
  const t0 = p.translate();
  return p.scale(p.scale() * S.k).translate([S.tx + t0[0] * S.k, S.ty + t0[1] * S.k]);
}

export function fitScale(w: number, h: number): number {
  return flatBase(w, h).scale();
}

// A phone reaches the same px/degree as a 1280 px desktop does at K_MAX.
export const smallKMax = (w: number, h: number): number =>
  K_MAX * Math.max(1, fitScale(1280, 800) / fitScale(w, h));

export const frontCentre = (S: ViewState): [number, number] => [-S.rot[0], -S.rot[1]];

export function centreLonLat(S: ViewState, W: number, H: number): [number, number] {
  if (S.view === 'globe') return frontCentre(S);
  const ll = proj(S, W, H).invert?.([W / 2, H / 2]);
  return ll && isFinite(ll[0]) ? [ll[0], ll[1]] : [0, 0];
}

/** Return the flat-view translate that centres `c` on the stage at zoom `k`. */
export function flatOffsetFor(
  S: ViewState,
  W: number,
  H: number,
  c: [number, number],
  k = S.k,
): { tx: number; ty: number } {
  const xy = proj({ ...S, view: 'flat', k, tx: 0, ty: 0 }, W, H)(c);
  return xy && isFinite(xy[0]) ? { tx: W / 2 - xy[0], ty: H / 2 - xy[1] } : { tx: 0, ty: 0 };
}

// Zoom ceiling for auto-framing, so a lone entity still has coastline in frame.
export const FOCUS_K_MAX = 5;

// Padding round a framed set, px: about a pin's height.
const FOCUS_PAD = 64;

const wrapLon = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;

// geoBounds goes the short way round across the antimeridian, where a min/max
// over the longitudes would span the world.
function boundsCentre(pts: [number, number][]): [number, number] {
  const [[x0, y0], [x1, y1]] = geoBounds({ type: 'MultiPoint', coordinates: pts });
  const span = x1 >= x0 ? x1 - x0 : x1 - x0 + 360;
  return [wrapLon(x0 + span / 2), (y0 + y1) / 2];
}

// The camera that frames `pts` between `top` and `bot`, or null when there is
// nothing to frame.
export function frameFor(
  S: ViewState,
  W: number,
  H: number,
  pts: [number, number][],
  [top, bot]: [number, number] = [0, H],
): TweenTo | null {
  if (!pts.length || W <= 0 || H <= 0) return null;
  const clampK = (k: number) => Math.max(K_MIN, Math.min(FOCUS_K_MAX, k));
  const roomW = Math.max(1, W - 2 * FOCUS_PAD);
  const roomH = Math.max(1, bot - top - 2 * FOCUS_PAD);
  const mid = (top + bot) / 2;

  if (S.view === 'globe') {
    // Rotate to the set's centre and zoom until its furthest point, r away,
    // clears the limb. Past a hemisphere nothing more fits.
    const c = boundsCentre(pts);
    const r = pts.reduce((m, p) => Math.max(m, geoDistance(p, c)), 0);
    const half = Math.min(roomW, roomH) / 2;
    const R = globeBase(W, H).scale();
    const k = r >= Math.PI / 2 ? K_MIN : clampK(half / (R * Math.sin(r)));
    // Tilt past the centre by the arc that puts it mid-band instead of mid-stage.
    const d = (Math.asin(Math.max(-1, Math.min(1, (H / 2 - mid) / (R * k)))) * 180) / Math.PI;
    return { k, rot: [-c[0], d - c[1]] };
  }

  // Measured in projected px: the flat map is cut at the antimeridian, and its
  // parallels are not evenly spaced.
  const p = flatBase(W, H);
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const c of pts) {
    const xy = p(c);
    if (!xy || !isFinite(xy[0]) || !isFinite(xy[1])) continue;
    x0 = Math.min(x0, xy[0]);
    x1 = Math.max(x1, xy[0]);
    y0 = Math.min(y0, xy[1]);
    y1 = Math.max(y1, xy[1]);
  }
  if (x0 > x1) return null;
  // A zero span divides to Infinity, which clamps to FOCUS_K_MAX.
  const k = clampK(Math.min(roomW / (x1 - x0), roomH / (y1 - y0)));
  return { k, tx: W / 2 - ((x0 + x1) / 2) * k, ty: mid - ((y0 + y1) / 2) * k };
}

// Guarded because vitest imports this module without a DOM.
export const REDUCED =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : ({ matches: false } as MediaQueryList);

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// cubic-bezier(0.4, 0, 0.2, 1): x(u) inverted by Newton's method, then y(u).
export function easeStandard(t: number): number {
  const bz = (u: number, a: number, b: number) =>
    3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
  let u = t;
  for (let i = 0; i < 6; i++) {
    const dx = 1.2 * (1 - u) * (1 - u) - 1.2 * (1 - u) * u + 2.4 * u * u;
    if (dx < 1e-6) break;
    u = Math.max(0, Math.min(1, u - (bz(u, 0.4, 0.2) - t) / dx));
  }
  return bz(u, 0, 1);
}

const shortWay = (a: number, b: number) => a + ((((b - a) % 360) + 540) % 360) - 180;

export interface TweenTo {
  k?: number;
  tx?: number;
  ty?: number;
  rot?: [number, number];
}

export class Tweener {
  private frame: number | null = null;

  constructor(
    private S: ViewState,
    private queue: (full?: boolean) => void,
    private setInteract: (on: boolean) => void,
  ) {}

  get running(): boolean {
    return this.frame !== null;
  }

  stop(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  to(to: TweenTo, ms: number, done?: () => void, ease = easeInOut): void {
    this.stop();
    const S = this.S;
    if (REDUCED.matches || !ms) {
      Object.assign(S, to);
      this.queue(true);
      done?.();
      return;
    }
    const from = { k: S.k, tx: S.tx, ty: S.ty, rot: S.rot.slice() as [number, number] };
    const rotTo: [number, number] | null = to.rot
      ? [shortWay(from.rot[0], to.rot[0]), to.rot[1]]
      : null;
    const t0 = performance.now();
    const step = (now: number) => {
      // rAF's timestamp can predate t0; a negative t would run the tween backwards.
      const t = Math.max(0, Math.min(1, (now - t0) / ms)),
        e = ease(t);
      const mix = (a: number, b: number) => a + (b - a) * e;
      if (to.k !== undefined) S.k = mix(from.k, to.k);
      if (to.tx !== undefined) S.tx = mix(from.tx, to.tx);
      if (to.ty !== undefined) S.ty = mix(from.ty, to.ty);
      if (rotTo) S.rot = [mix(from.rot[0], rotTo[0]), mix(from.rot[1], rotTo[1])];
      this.setInteract(t < 1);
      this.queue(t >= 1);
      if (t < 1) this.frame = requestAnimationFrame(step);
      else {
        this.frame = null;
        done?.();
      }
    };
    this.frame = requestAnimationFrame(step);
  }
}

interface InputHooks {
  S: ViewState;
  stage: HTMLElement;
  queue: (full?: boolean) => void;
  setInteract: (on: boolean) => void;
  tween: Tweener;
  clickAt: (e: PointerEvent) => void;
  hoverAt: (e: PointerEvent) => void;
  clearHover: () => void;
  zoomTo: (k: number, mx: number, my: number) => void;
  zoomStep: (f: number) => void;
  resetView: () => void;
  onActivity?: () => void;
}

/** Wire pointer, wheel and keyboard input on the stage; return the unbinder. */
export function bindInput(h: InputHooks): () => void {
  const { stage, S } = h;
  stage.style.cursor = 'crosshair';
  const pointers = new Map<number, { x: number; y: number }>();
  let downAt: [number, number] | null = null;
  let base: { rot: [number, number]; tx: number; ty: number } | null = null;
  let moved = 0;
  // Movement allowed before a tap turns into a pan.
  let slop = 4;
  let dragging = false;
  let pinch: {
    dist: number;
    k: number;
    mid: [number, number];
    tx: number;
    ty: number;
  } | null = null;

  const pair = () => [...pointers.values()].slice(0, 2);
  const spread = () => {
    const a = pair();
    return Math.max(1, Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y));
  };
  // Midpoint in stage coordinates: the rect is read live so a page scroll
  // partway through the gesture cannot smear the anchor.
  const midpoint = (): [number, number] => {
    const a = pair(),
      r = stage.getBoundingClientRect();
    return [(a[0].x + a[1].x) / 2 - r.left, (a[0].y + a[1].y) / 2 - r.top];
  };

  const startPinch = () => {
    pinch = { dist: spread(), k: S.k, mid: midpoint(), tx: S.tx, ty: S.ty };
    downAt = null;
    dragging = false;
    moved = 99;
    h.clearHover();
  };

  const onWindowMove = (e: PointerEvent) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      // Pan and zoom solved against the state at pinch start, so the point
      // under the first midpoint stays under the current one.
      const m = midpoint();
      const k = Math.max(K_MIN, Math.min(S.kMax, pinch.k * (spread() / pinch.dist)));
      const g = k / pinch.k;
      h.setInteract(true);
      if (S.view === 'flat') {
        S.tx = m[0] - g * (pinch.mid[0] - pinch.tx);
        S.ty = m[1] - g * (pinch.mid[1] - pinch.ty);
      }
      S.k = k;
      h.queue();
      return;
    }
    if (!downAt || !base) return;
    const dx = e.clientX - downAt[0],
      dy = e.clientY - downAt[1];
    moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
    if (moved < slop) return;
    if (!dragging) {
      dragging = true;
      h.clearHover();
    }
    stage.style.cursor = 'grabbing';
    h.setInteract(true);
    if (S.view === 'globe') {
      const s = 0.28 / Math.max(1, S.k * 0.7);
      S.rot = [base.rot[0] + dx * s, Math.max(-78, Math.min(78, base.rot[1] - dy * s))];
    } else {
      S.tx = base.tx + dx;
      S.ty = base.ty + dy;
    }
    h.queue();
  };

  const onWindowUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    // Lifting one of three fingers changes which pair drives the gesture, so
    // rebase on the pair that is left rather than jumping.
    if (pinch && pointers.size >= 2) {
      startPinch();
      return;
    }
    if (pinch) {
      pinch = null;
      const rest = pair()[0];
      if (rest) {
        downAt = [rest.x, rest.y];
        base = { rot: S.rot.slice() as [number, number], tx: S.tx, ty: S.ty };
        moved = 99;
      } else {
        h.setInteract(false);
        h.queue(true);
      }
      return;
    }
    if (pointers.size) return;
    const wasClick = moved < slop;
    downAt = null;
    dragging = false;
    stage.style.cursor = 'crosshair';
    h.setInteract(false);
    window.removeEventListener('pointermove', onWindowMove);
    window.removeEventListener('pointerup', onWindowUp);
    window.removeEventListener('pointercancel', onWindowUp);
    if (wasClick) h.clickAt(e);
    else h.queue(true);
  };

  const onDown = (e: PointerEvent) => {
    h.onActivity?.();
    h.tween.stop();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      startPinch();
      return;
    }
    if (pointers.size > 2) return;
    downAt = [e.clientX, e.clientY];
    moved = 0;
    slop = e.pointerType === 'mouse' ? 4 : 16;
    dragging = false;
    base = { rot: S.rot.slice() as [number, number], tx: S.tx, ty: S.ty };
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowUp);
  };

  const onMove = (e: PointerEvent) => {
    if (downAt || pinch) return;
    h.hoverAt(e);
  };
  const onLeave = () => h.clearHover();

  let wheelTimer: ReturnType<typeof setTimeout> | null = null;
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    h.onActivity?.();
    h.tween.stop();
    const f = Math.exp(-e.deltaY * 0.0016);
    const r = stage.getBoundingClientRect();
    h.zoomTo(S.k * f, e.clientX - r.left, e.clientY - r.top);
    h.setInteract(true);
    if (wheelTimer) clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      h.setInteract(false);
      h.queue(true);
    }, 200);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.target !== stage) return;
    h.onActivity?.();
    const big = e.shiftKey;
    const pan = big ? 160 : 60,
      turn = big ? 20 : 8;
    const step = (sx: number, sy: number) => {
      if (S.view === 'globe') {
        h.tween.to(
          { rot: [S.rot[0] + sx * turn, Math.max(-78, Math.min(78, S.rot[1] - sy * turn))] },
          190,
        );
      } else {
        h.tween.to({ tx: S.tx + sx * pan, ty: S.ty + sy * pan }, 190);
      }
    };
    switch (e.key) {
      case 'ArrowLeft':
        step(1, 0);
        break;
      case 'ArrowRight':
        step(-1, 0);
        break;
      case 'ArrowUp':
        step(0, 1);
        break;
      case 'ArrowDown':
        step(0, -1);
        break;
      case '+':
      case '=':
        h.zoomStep(big ? 2 : 1.4);
        break;
      case '-':
      case '_':
        h.zoomStep(1 / (big ? 2 : 1.4));
        break;
      case '0':
        h.resetView();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerleave', onLeave);
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('keydown', onKey);

  return () => {
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointermove', onMove);
    stage.removeEventListener('pointerleave', onLeave);
    stage.removeEventListener('wheel', onWheel);
    stage.removeEventListener('keydown', onKey);
    window.removeEventListener('pointermove', onWindowMove);
    window.removeEventListener('pointerup', onWindowUp);
    window.removeEventListener('pointercancel', onWindowUp);
    if (wheelTimer) clearTimeout(wheelTimer);
  };
}
