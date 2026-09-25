import {
  geoBounds,
  geoDistance,
  geoNaturalEarth1,
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
  ready: boolean;
}

export const initialView = (): ViewState => ({
  view: 'flat',
  theme: 'light',
  rot: [-18, -8],
  k: 1,
  tx: 0,
  ty: 0,
  ready: false,
});

export const K_MIN = 1;
export const K_MAX = 9;
// What one press of a zoom button multiplies k by. The keyboard steps finer
// (1.4, or 2 with shift) and is not derived from this.
export const ZOOM_BTN = 1.6;

// The k = 1 camera each view is a multiple of. Every flat projection below is
// this one scaled about the origin, which is what makes a fit a ratio rather
// than a search.
const flatBase = (w: number, h: number): GeoProjection =>
  geoNaturalEarth1().fitExtent(
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

export const frontCentre = (S: ViewState): [number, number] => [-S.rot[0], -S.rot[1]];

export function centreLonLat(S: ViewState, W: number, H: number): [number, number] {
  if (S.view === 'globe') return frontCentre(S);
  const ll = proj(S, W, H).invert?.([W / 2, H / 2]);
  return ll && isFinite(ll[0]) ? [ll[0], ll[1]] : [0, 0];
}

export function flatOffsetFor(
  S: ViewState,
  W: number,
  H: number,
  c: [number, number],
  k?: number,
): { tx: number; ty: number } {
  const kk = k === undefined ? S.k : k;
  const p = flatBase(W, H);
  const t0 = p.translate();
  const xy = p.scale(p.scale() * kk).translate([t0[0] * kk, t0[1] * kk])(c);
  return xy && isFinite(xy[0]) ? { tx: W / 2 - xy[0], ty: H / 2 - xy[1] } : { tx: 0, ty: 0 };
}

// An auto-fit stops well short of K_MAX. A filter that leaves one entity, or a
// handful of them a few hundred metres apart, would otherwise fit to a patch of
// empty sea with no coastline in frame to say where it is; going closer than
// this stays the user's own move.
export const FOCUS_K_MAX = 5;

// Breathing room around a framed set, in px. About a pin's height, so the
// outermost pin sits inside the stage rather than half off it.
const FOCUS_PAD = 64;

const wrapLon = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;

// geoBounds walks the geometry the way d3 projects it, so a set straddling the
// antimeridian comes back as the short way round. A min/max over the longitudes
// would call the same handful of points a whole world wide.
function boundsCentre(pts: [number, number][]): [number, number] {
  const [[x0, y0], [x1, y1]] = geoBounds({ type: 'MultiPoint', coordinates: pts });
  const span = x1 >= x0 ? x1 - x0 : x1 - x0 + 360;
  return [wrapLon(x0 + span / 2), (y0 + y1) / 2];
}

// The camera that frames `pts`, or null when there is nothing to frame.
export function frameFor(
  S: ViewState,
  W: number,
  H: number,
  pts: [number, number][],
): TweenTo | null {
  if (!pts.length || W <= 0 || H <= 0) return null;
  const fit = (k: number) => Math.max(K_MIN, Math.min(FOCUS_K_MAX, k));
  const roomW = Math.max(1, W - 2 * FOCUS_PAD);
  const roomH = Math.max(1, H - 2 * FOCUS_PAD);

  if (S.view === 'globe') {
    // The globe pans by turning, so framing is a rotation plus however far the
    // camera pulls back for the furthest point to clear the limb. Past a
    // hemisphere nothing more fits however far out it goes.
    const c = boundsCentre(pts);
    const r = pts.reduce((m, p) => Math.max(m, geoDistance(p, c)), 0);
    const half = Math.min(roomW, roomH) / 2;
    const k = r >= Math.PI / 2 ? K_MIN : fit(half / (globeBase(W, H).scale() * Math.sin(r)));
    return { k, rot: [-c[0], -c[1]] };
  }

  // Natural Earth is cut at the antimeridian, so a set straddling it really
  // does span the sheet and no centre draws it together -- which is why the
  // flat fit is measured in projected px rather than in degrees. It is also
  // exact for a projection whose parallels are not evenly spaced.
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
  // A degenerate span divides to Infinity and clamps to FOCUS_K_MAX, which is
  // what a single entity should get anyway.
  const k = fit(Math.min(roomW / (x1 - x0), roomH / (y1 - y0)));
  return { k, tx: W / 2 - ((x0 + x1) / 2) * k, ty: H / 2 - ((y0 + y1) / 2) * k };
}

export const REDUCED =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : ({ matches: false } as MediaQueryList);

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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

  to(to: TweenTo, ms: number, done?: () => void): void {
    this.stop();
    const S = this.S;
    if (REDUCED.matches || !ms) {
      Object.assign(S, to);
      this.queue(true);
      if (done) done();
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
        e = easeInOut(t);
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
        if (done) done();
      }
    };
    this.frame = requestAnimationFrame(step);
  }
}

export interface InputHooks {
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

export function bindInput(h: InputHooks): () => void {
  const { stage, S } = h;
  stage.style.cursor = 'crosshair';
  const PT = new Map<number, { x: number; y: number }>();
  let p0: [number, number] | null = null;
  let base: { rot: [number, number]; tx: number; ty: number } | null = null;
  let moved = 0;
  let dragging = false;
  let pinch: {
    d: number;
    k: number;
    m: [number, number];
    tx: number;
    ty: number;
  } | null = null;

  const pair = () => [...PT.values()].slice(0, 2);
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
    pinch = { d: spread(), k: S.k, m: midpoint(), tx: S.tx, ty: S.ty };
    p0 = null;
    dragging = false;
    moved = 99;
    h.clearHover();
  };

  const mv = (e: PointerEvent) => {
    if (PT.has(e.pointerId)) PT.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && PT.size >= 2) {
      // Solve pan and zoom together against the state the pinch started in:
      // the point under the first midpoint stays under the current one. Doing
      // it per-frame instead mixes an absolute pan with an incremental zoom
      // anchor and the map slides out from under the fingers.
      const m = midpoint();
      const k = Math.max(K_MIN, Math.min(K_MAX, pinch.k * (spread() / pinch.d)));
      const g = k / pinch.k;
      h.setInteract(true);
      if (S.view === 'flat') {
        S.tx = m[0] - g * (pinch.m[0] - pinch.tx);
        S.ty = m[1] - g * (pinch.m[1] - pinch.ty);
      }
      S.k = k;
      h.queue();
      return;
    }
    if (!p0 || !base) return;
    const dx = e.clientX - p0[0],
      dy = e.clientY - p0[1];
    moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
    if (moved < 4) return;
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

  const up = (e: PointerEvent) => {
    PT.delete(e.pointerId);
    // Lifting one of three fingers changes which pair drives the gesture, so
    // rebase on the pair that is left rather than jumping.
    if (pinch && PT.size >= 2) {
      startPinch();
      return;
    }
    if (pinch) {
      pinch = null;
      const rest = pair()[0];
      if (rest) {
        p0 = [rest.x, rest.y];
        base = { rot: S.rot.slice() as [number, number], tx: S.tx, ty: S.ty };
        moved = 99;
      } else {
        h.setInteract(false);
        h.queue(true);
      }
      return;
    }
    if (PT.size) return;
    const wasClick = moved < 4;
    p0 = null;
    dragging = false;
    stage.style.cursor = 'crosshair';
    h.setInteract(false);
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (wasClick) h.clickAt(e);
    else h.queue(true);
  };

  const onDown = (e: PointerEvent) => {
    h.onActivity?.();
    h.tween.stop();
    PT.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (PT.size === 2) {
      startPinch();
      return;
    }
    if (PT.size > 2) return;
    p0 = [e.clientX, e.clientY];
    moved = 0;
    dragging = false;
    base = { rot: S.rot.slice() as [number, number], tx: S.tx, ty: S.ty };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onMove = (e: PointerEvent) => {
    if (p0 || pinch) return;
    h.hoverAt(e);
  };
  const onLeave = () => h.clearHover();

  let wt: ReturnType<typeof setTimeout> | null = null;
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    h.onActivity?.();
    h.tween.stop();
    const f = Math.exp(-e.deltaY * 0.0016);
    const r = stage.getBoundingClientRect();
    h.zoomTo(S.k * f, e.clientX - r.left, e.clientY - r.top);
    h.setInteract(true);
    if (wt) clearTimeout(wt);
    wt = setTimeout(() => {
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
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (wt) clearTimeout(wt);
  };
}
