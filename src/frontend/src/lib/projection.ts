/**
 * Projection, tweening and pointer/keyboard input for the stage.
 *
 * The view state S is one plain object the whole stage reads: which projection,
 * which theme, the globe's rotation, the scale and the flat map's offsets.
 */
import { geoNaturalEarth1, geoOrthographic, type GeoProjection } from 'd3-geo';
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

/* ---------- the system's colour scheme ----------
   Guarded like REDUCED below: matchMedia is a browser API and this module is
   imported by code that runs before any of it exists. */
const DARK_SCHEME =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      } as unknown as MediaQueryList);

/** Whether the visitor's system asks for a dark UI right now. */
export const prefersDark = (): boolean => DARK_SCHEME.matches;

/** Subscribes to system light/dark changes; the return value unsubscribes. */
export function onSchemeChange(cb: (dark: boolean) => void): () => void {
  const handler = () => cb(DARK_SCHEME.matches);
  DARK_SCHEME.addEventListener('change', handler);
  return () => DARK_SCHEME.removeEventListener('change', handler);
}

/** Opens in whichever scheme the system is set to; the switch overrides it. */
export const initialView = (): ViewState => ({
  view: 'flat',
  theme: prefersDark() ? 'dark' : 'light',
  rot: [-18, -8],
  k: 1,
  tx: 0,
  ty: 0,
  ready: false,
});

export const K_MIN = 1;
export const K_MAX = 9;

export function proj(S: ViewState, w: number, h: number): GeoProjection {
  if (S.view === 'globe') {
    const p = geoOrthographic()
      .rotate(S.rot)
      .fitExtent(
        [
          [24, 24],
          [w - 24, h - 24],
        ],
        { type: 'Sphere' },
      );
    return p.scale(p.scale() * S.k).translate([w / 2, h / 2]);
  }
  const p = geoNaturalEarth1().fitExtent(
    [
      [10, 18],
      [w - 10, h - 18],
    ],
    { type: 'Sphere' },
  );
  const t0 = p.translate();
  return p.scale(p.scale() * S.k).translate([S.tx + t0[0] * S.k, S.ty + t0[1] * S.k]);
}

/**
 * The scale fitExtent hands the flat map in a W×H stage, before S.k multiplies it.
 *
 * proj() re-fits on every paint, so this number moves with the stage's size: open
 * the 420px sidebar on a 1400px frame and it drops 30%, which reads as the map
 * zooming out on its own. Stage.absorbResize() divides it out. Must stay in step
 * with proj()'s extent above.
 */
export function fitScale(w: number, h: number): number {
  return geoNaturalEarth1()
    .fitExtent(
      [
        [10, 18],
        [w - 10, h - 18],
      ],
      { type: 'Sphere' },
    )
    .scale();
}

export const frontCentre = (S: ViewState): [number, number] => [-S.rot[0], -S.rot[1]];

/** The lon/lat currently under the middle of the stage — the anchor a mode swap keeps still. */
export function centreLonLat(S: ViewState, W: number, H: number): [number, number] {
  if (S.view === 'globe') return frontCentre(S);
  const ll = proj(S, W, H).invert?.([W / 2, H / 2]);
  return ll && isFinite(ll[0]) ? [ll[0], ll[1]] : [0, 0];
}

/** Offsets that park a given lon/lat in the middle of the flat map at the current scale. */
export function flatOffsetFor(
  S: ViewState,
  W: number,
  H: number,
  c: [number, number],
  k?: number,
): { tx: number; ty: number } {
  const kk = k === undefined ? S.k : k;
  const p = geoNaturalEarth1().fitExtent(
    [
      [10, 18],
      [W - 10, H - 18],
    ],
    { type: 'Sphere' },
  );
  const t0 = p.translate();
  const xy = p.scale(p.scale() * kk).translate([t0[0] * kk, t0[1] * kk])(c);
  return xy && isFinite(xy[0]) ? { tx: W / 2 - xy[0], ty: H / 2 - xy[1] } : { tx: 0, ty: 0 };
}

/* ---------- tweening: view changes move rather than jump ---------- */
export const REDUCED =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : ({ matches: false } as MediaQueryList);

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Longitude takes the short way round, so a spin never crosses the whole globe to arrive. */
const shortWay = (a: number, b: number) => a + ((((b - a) % 360) + 540) % 360) - 180;

export interface TweenTo {
  k?: number;
  tx?: number;
  ty?: number;
  rot?: [number, number];
}

/** Holds the one frame a view tween runs on. `queue` is the stage's repaint
    request; `setInteract` tells it whether a hand is still on the map. */
export class Tweener {
  private frame: number | null = null;

  constructor(
    private S: ViewState,
    private queue: (full?: boolean) => void,
    private setInteract: (on: boolean) => void,
  ) {}

  /** True while a tween owns the view — see Stage.absorbResize(). */
  get running(): boolean {
    return this.frame !== null;
  }

  /** Cancels whatever was in flight; a hand on the map always wins. */
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
      const t = Math.min(1, (now - t0) / ms),
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

/* ---------- input ---------- */
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
  /**
   * Deliberate input on the stage — a press, the wheel, a key. NOT hover: the
   * stage's pointermove fires continuously while a cursor merely rests over the
   * map, and treating that as intent would kill the first-load coach before it
   * had said anything. The one caller is Stage, to dismiss that coach.
   */
  onActivity?: () => void;
}

/**
 * Drag pans the flat map and spins the globe; the wheel zooms about the pointer.
 * Two fingers pinch, since a wheel event never arrives from a touchscreen. A drag
 * under four pixels is a click.
 */
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
    r: DOMRect;
  } | null = null;

  const pair = () => [...PT.values()];
  const spread = () => {
    const a = pair();
    return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
  };
  const midpoint = (): [number, number] => {
    const a = pair();
    return [(a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2];
  };

  /* A second finger ends the one-finger drag and starts a pinch from the current scale. */
  const startPinch = () => {
    const r = stage.getBoundingClientRect(),
      m = midpoint();
    pinch = { d: spread(), k: S.k, m, tx: S.tx, ty: S.ty, r };
    p0 = null;
    dragging = false;
    moved = 99;
    h.clearHover();
  };

  const mv = (e: PointerEvent) => {
    if (PT.has(e.pointerId)) PT.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && PT.size >= 2) {
      const m = midpoint(),
        d = spread();
      h.setInteract(true);
      /* The flat map also slides with the midpoint; the globe only scales. */
      if (S.view === 'flat') {
        S.tx = pinch.tx + (m[0] - pinch.m[0]);
        S.ty = pinch.ty + (m[1] - pinch.m[1]);
      }
      h.zoomTo(pinch.k * (d / pinch.d), m[0] - pinch.r.left, m[1] - pinch.r.top);
      return;
    }
    if (!p0 || !base) return;
    const dx = e.clientX - p0[0],
      dy = e.clientY - p0[1];
    moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
    if (moved < 4) return;
    /* The first frame of a drag dismisses the hover; later ones have nothing to. */
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
    if (pinch && PT.size < 2) {
      pinch = null;
      /* One finger left after a pinch: re-base the drag on it rather than jumping. */
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

  /* Keyboard: the map is a focus stop, so it has to be drivable without a pointer. */
  const onKey = (e: KeyboardEvent) => {
    if (e.target !== stage) return;
    h.onActivity?.();
    const big = e.shiftKey;
    const pan = big ? 160 : 60,
      turn = big ? 20 : 8;
    /* Signed direction, so the keys match what the same drag would do. */
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
