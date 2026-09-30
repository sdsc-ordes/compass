import { geoDistance } from 'd3-geo';
import type { GeoProjection } from 'd3-geo';
import { ASTRONAUT, NIGHT_INK, type Palette } from './palette';
import { frontCentre, REDUCED, type ViewState } from './projection';
import logoUrl from '../assets/www.oceancare.org-64x64.png';
import { isCluster, type Cluster, type PinBox, type PinTarget, type Entry } from './types';

const PIN_EDGE = ASTRONAUT;

const PIN_INK_LIGHT = '#FFFFFF';
const PIN_INK_DARK = NIGHT_INK;

const TAU = 2 * Math.PI;

const inkCache = new Map<string, string>();

// The dot or numeral colour on `fill`, by WCAG relative luminance.
function inkOn(fill: string): string {
  const held = inkCache.get(fill);
  if (held) return held;
  const hex = /^#([0-9a-f]{6})$/i.exec(fill);
  let ink = PIN_INK_LIGHT;
  if (hex) {
    const n = parseInt(hex[1], 16);
    const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    ink = lum > 0.179 ? PIN_INK_DARK : PIN_INK_LIGHT;
  }
  inkCache.set(fill, ink);
  return ink;
}

// Hover and selection grow a mark by up to 10%.
const growScale = (grow: number) => 1 + 0.1 * grow;

const pinMetrics = (sc: number) => ({
  sc,
  headR: 10.5 * sc,
  headOff: 21 * sc,
  w: 24 * sc,
  h: 28 * sc,
});
type PinMetrics = ReturnType<typeof pinMetrics>;

// Tip-to-head offset of an unscaled pin; clustering and fanning work on heads.
const HEAD = 21;

// How far a pin fading in or out sits above its spot.
const rise = (fade: number) => (1 - fade) * 7;

function gmapsPinPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  m: PinMetrics,
): void {
  const headCy = y - m.headOff;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(
    x - 3.5 * m.sc,
    y - 9 * m.sc,
    x - m.headR,
    headCy + m.headR * 0.32,
    x - m.headR,
    headCy,
  );
  ctx.arc(x, headCy, m.headR, Math.PI, 0, false);
  ctx.bezierCurveTo(x + m.headR, headCy + m.headR * 0.32, x + 3.5 * m.sc, y - 9 * m.sc, x, y);
  ctx.closePath();
}

// Teardrop pin with its tip at (x, y).
function drawGmapsPin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fill: string,
  edge: string,
  grow: number,
  alpha: number,
): { headCy: number; m: PinMetrics } {
  const m = pinMetrics(growScale(grow));
  const headCy = y - m.headOff;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(x, y + 1.5 * m.sc, 5 * m.sc, 1.6 * m.sc, 0, 0, TAU);
  ctx.fillStyle = edge;
  ctx.fill();
  gmapsPinPath(ctx, x, y, m);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PIN_EDGE;
  ctx.lineWidth = 4 * m.sc;
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.4 * m.sc;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, headCy, 4.2 * m.sc, 0, TAU);
  ctx.fillStyle = inkOn(fill);
  ctx.fill();
  ctx.restore();
  return { headCy, m };
}

// Numbered disc centred on (x, y); returns its radius.
function drawCluster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  n: number,
  fill: string,
  edge: string,
  grow: number,
): number {
  const R = (13 + Math.min(7, n)) * growScale(grow);
  ctx.beginPath();
  ctx.arc(x, y, R + 3, 0, TAU);
  ctx.fillStyle = edge;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, R + 1.6, 0, TAU);
  ctx.strokeStyle = PIN_EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = inkOn(fill);
  ctx.font = '700 ' + (n > 9 ? 12 : 13) + 'px Cabin, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), x, y + 0.5);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  return R;
}

// The selected pin: a ringed dot centred on (x, y); returns its outer radius.
function drawAnchor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  p: Palette,
  grow: number,
  alpha: number,
): number {
  const sc = growScale(grow);
  const R = 7 * sc;
  const out = R + 2 * sc;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, out, 0, TAU);
  ctx.fillStyle = p.pinRing;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = p.pinSel;
  ctx.lineWidth = 2.5 * sc;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, R + 1.45 * sc, 0, TAU);
  ctx.strokeStyle = PIN_EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 2.6 * sc, 0, TAU);
  ctx.fillStyle = p.pinSel;
  ctx.fill();
  ctx.restore();
  return out;
}

export const isHost = (d: Entry) => d.typeIri.endsWith('#HostOrganization');

// Inlined as a data URL by the lib build, so it resolves on any host page.
let logo: HTMLImageElement | null = null;

function loadLogo(onload: () => void): void {
  if (logo) return;
  logo = new Image();
  logo.onload = onload;
  logo.src = logoUrl;
}

// The host organisation's logo disc centred on (x, y); returns its outer radius.
function drawHost(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ring: string,
  grow: number,
  alpha: number,
): number {
  const sc = growScale(grow);
  const R = 15 * sc;
  // Same width as the anchor's ring.
  const lineW = 2.5 * sc;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = ring;
  ctx.lineWidth = lineW;
  ctx.stroke();
  if (logo?.complete && logo.naturalWidth) {
    const size = 1.3 * R;
    ctx.drawImage(logo, x - size / 2, y - size / 2, size, size);
  }
  ctx.restore();
  return R + lineW / 2;
}

export const onFront = (S: ViewState, c: [number, number]) =>
  S.view === 'flat' || geoDistance(c, frontCentre(S)) < 1.52;

const CLUSTER_R = 26;

interface Group<T> {
  x: number;
  y: number;
  items: T[];
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

// Screen-distance clustering on pin heads (hx, hy).
function group<T extends { hx: number; hy: number }>(pts: T[]): Group<T>[] {
  const recentre = (g: Group<T>) => {
    g.x = mean(g.items.map((i) => i.hx));
    g.y = mean(g.items.map((i) => i.hy));
  };
  const groups: Group<T>[] = [];
  pts.forEach((pt) => {
    const g = groups.find((other) => Math.hypot(other.x - pt.hx, other.y - pt.hy) <= CLUSTER_R);
    if (g) {
      g.items.push(pt);
      recentre(g);
    } else groups.push({ x: pt.hx, y: pt.hy, items: [pt] });
  });
  // Recentring can bring groups together; merge them, a bounded number of times.
  for (let pass = 0; pass < 8; pass++) {
    let merged = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (Math.hypot(groups[i].x - groups[j].x, groups[i].y - groups[j].y) <= CLUSTER_R + 8) {
          groups[i].items = groups[i].items.concat(groups[j].items);
          groups.splice(j, 1);
          recentre(groups[i]);
          merged = true;
          break outer;
        }
      }
    }
    if (!merged) break;
  }
  return groups;
}

const fanGap = (touch: boolean) => (touch ? 44 : 31);
const fanRadius = (n: number, touch: boolean) =>
  fanGap(touch) / (2 * Math.sin(Math.PI / Math.max(2, n))) + 2;

const fanFrom = (n: number) => (n === 2 ? 0 : -Math.PI / 2);

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// The turn of an n-pin ring, in 30 degree steps, that keeps the most pins on stage.
function fanAngle(ax: number, ay: number, R: number, n: number, W: number, H: number): number {
  const M = 14;
  const from = fanFrom(n);
  let best = from,
    bestInside = -1;
  for (let i = 0; i < 12; i++) {
    const start = from + (i * Math.PI) / 6;
    let inside = 0;
    for (let j = 0; j < n; j++) {
      const th = start + (j * 2 * Math.PI) / n;
      const x = ax + Math.cos(th) * R,
        y = ay + Math.sin(th) * R;
      if (x > M && x < W - M && y - HEAD > M && y < H - M) inside++;
    }
    if (inside > bestInside) {
      bestInside = inside;
      best = start;
    }
  }
  return best;
}

// Tip positions of `items` fanned into a ring round their centroid.
function fanSpots(
  items: { x: number; y: number }[],
  touch: boolean,
  W: number,
  H: number,
): [number, number][] {
  const n = items.length;
  const ax = mean(items.map((i) => i.x)),
    ay = mean(items.map((i) => i.y));
  const R = fanRadius(n, touch);
  const a0 = fanAngle(ax, ay, R, n, W, H);
  return items.map((_item, i) => {
    const th = a0 + (i * 2 * Math.PI) / n;
    return [ax + Math.cos(th) * R, ay + Math.sin(th) * R];
  });
}

/** Return where `d` lands once fanned under `pr`, or null when it does not fan. */
export function fanSpot(
  pr: GeoProjection,
  pins: Entry[],
  d: Entry,
  W: number,
  H: number,
  touch: boolean,
): [number, number] | null {
  const pts = pins.flatMap((q) => {
    const xy = !isHost(q) && pr(q.lonLat);
    return xy ? [{ x: xy[0], y: xy[1], hx: xy[0], hy: xy[1] - HEAD, id: q.id }] : [];
  });
  const g = group(pts).find((gg) => gg.items.length > 1 && gg.items.some((i) => i.id === d.id));
  if (!g) return null;
  return fanSpots(g.items, touch, W, H)[g.items.findIndex((i) => i.id === d.id)];
}

interface Anim {
  grow: number;
  growTo: number;
  fade: number;
  fadeTo: number;
}

const EASE = 0.22;
const SNAP = 0.006;

// One frame of easing from `value` towards `to`, landing on it once within SNAP.
const approach = (value: number, to: number) =>
  Math.abs(to - value) < SNAP ? to : value + (to - value) * EASE;

const emphasis = (id: string, selectedId: string | null, hoveredId: string | null) =>
  id === selectedId || id === hoveredId ? 1 : 0;

// Per-pin grow (hover, selection) and fade (entering, leaving), plus the
// max-zoom fan, eased on one requestAnimationFrame loop.
export class PinAnimator {
  private anim = new Map<string, Anim>();
  private frame: number | null = null;
  live: Entry[] = [];
  leaving: Entry[] = [];
  private known = new Map<string, Entry>();
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  fan = 0;
  private fanTo = 0;
  // Groups fanned at max zoom, kept until the fan has folded.
  private fanSets: string[][] = [];
  private fanIds = new Set<string>();

  constructor(
    private paint: () => void,
    private settled: () => void = () => {},
  ) {
    loadLogo(paint);
  }

  private track(id: string): Anim {
    let a = this.anim.get(id);
    if (!a) {
      a = { grow: 0, growTo: 0, fade: REDUCED.matches ? 1 : 0, fadeTo: 1 };
      this.anim.set(id, a);
    }
    return a;
  }

  growOf(id: string): number {
    return this.anim.get(id)?.grow ?? 0;
  }
  fadeOf(id: string): number {
    return this.anim.get(id)?.fade ?? 1;
  }

  // Open the fan or fold it. While open, `sets` is re-read each paint.
  aimFan(open: boolean, sets: () => string[][]): { sets: string[][]; ids: Set<string> } {
    const to = open ? 1 : 0;
    if (to !== this.fanTo) {
      this.fanTo = to;
      if (REDUCED.matches) this.landFan();
      else this.start();
    }
    if (open) {
      this.fanSets = sets();
      this.fanIds = new Set(this.fanSets.flat());
    }
    return { sets: this.fanSets, ids: this.fanIds };
  }

  private landFan(): void {
    this.fan = this.fanTo;
    if (this.fan) return;
    this.fanSets = [];
    this.fanIds = new Set();
  }

  private start(): void {
    if (this.frame !== null) return;
    const loop = () => {
      const moving = this.step();
      this.paint();
      this.frame = moving ? requestAnimationFrame(loop) : null;
      if (!moving) this.settled();
    };
    this.frame = requestAnimationFrame(loop);
  }

  // Take `visible` as the live set; pins no longer in it fade out as `leaving`.
  roster(visible: Entry[]): void {
    const liveIds = new Set(visible.map((d) => d.id));
    visible.forEach((d) => {
      this.known.set(d.id, d);
      this.track(d.id).fadeTo = 1;
    });
    this.known.forEach((_d, id) => {
      const a = this.anim.get(id);
      if (a && !liveIds.has(id)) a.fadeTo = 0;
    });
    this.live = visible;
    this.leaving = [...this.known.values()].filter((d) => {
      const a = this.anim.get(d.id);
      return !liveIds.has(d.id) && !!a && a.fade > 0.01;
    });
    this.known.forEach((_d, id) => {
      if (!liveIds.has(id) && !this.anim.has(id)) this.known.delete(id);
    });
  }

  private step(): boolean {
    let moving = false;
    this.anim.forEach((a, id) => {
      a.growTo = emphasis(id, this.selectedId, this.hoveredId);
      a.grow = approach(a.grow, a.growTo);
      a.fade = approach(a.fade, a.fadeTo);
      if (a.grow !== a.growTo || a.fade !== a.fadeTo) moving = true;
      if (a.fade === 0 && a.fadeTo === 0 && a.grow === 0) this.anim.delete(id);
    });
    if (Math.abs(this.fanTo - this.fan) < SNAP) this.landFan();
    else {
      this.fan += (this.fanTo - this.fan) * EASE;
      moving = true;
    }
    return moving;
  }

  pump(visible: Entry[], selectedId: string | null, hoveredId: string | null): void {
    this.selectedId = selectedId;
    this.hoveredId = hoveredId;
    this.roster(visible);
    if (REDUCED.matches) {
      this.anim.forEach((a, id) => {
        a.growTo = emphasis(id, selectedId, hoveredId);
        a.grow = a.growTo;
        a.fade = a.fadeTo;
      });
      this.landFan();
      this.paint();
      this.settled();
      return;
    }
    this.start();
  }

  stop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}

interface DrawPinsArgs {
  ctx: CanvasRenderingContext2D;
  pr: GeoProjection;
  W: number;
  H: number;
  p: Palette;
  S: ViewState;
  anim: PinAnimator;
  visible: Entry[];
  selected: Entry | null;
  touch: boolean;
  clusterLabel: (n: number) => { title: string; where: string };
}

/** Draw every pin, cluster and host mark; return their boxes in paint order. */
export function drawPins(args: DrawPinsArgs): PinBox[] {
  const { ctx, pr, W, H, p, S, anim, selected, touch, clusterLabel } = args;
  anim.roster(args.visible);
  const boxes: PinBox[] = [];
  const onStage = (xy: [number, number] | null) =>
    !!xy && !isNaN(xy[0]) && xy[0] > -30 && xy[0] < W + 30 && xy[1] > -30 && xy[1] < H + 30;
  const pins: { x: number; y: number; hx: number; hy: number; d: Entry }[] = [];
  const hosts: typeof pins = [];
  anim.live
    .filter((d) => onFront(S, d.lonLat))
    .forEach((d) => {
      const xy = pr(d.lonLat);
      if (!onStage(xy)) return;
      const [x, y] = xy as [number, number];
      (isHost(d) ? hosts : pins).push({ x, y, hx: x, hy: y - HEAD, d });
    });
  const fan = anim.aimFan(S.k >= S.kMax - 1e-6, () =>
    group(pins)
      .filter((g) => g.items.length > 1)
      .map((g) => g.items.map((i) => i.d.id)),
  );
  const unfanned = pins.filter((q) => !fan.ids.has(q.d.id));
  const byId = new Map(pins.map((q) => [q.d.id, q]));
  const rings = fan.sets.map((ids) => ids.flatMap((id) => byId.get(id) ?? []));
  rings.filter((ring) => ring.length < 2).forEach((ring) => unfanned.push(...ring));

  // Tip at (x, y).
  const drawOne = (d: Entry, x: number, y: number) => {
    const grow = anim.growOf(d.id),
      fade = anim.fadeOf(d.id);
    const lift = rise(fade);
    if (selected?.id === d.id) {
      const cy = y - lift;
      const R = drawAnchor(ctx, x, cy, p, grow, fade);
      boxes.push({
        x,
        y: cy,
        w: R * 2,
        h: R * 2,
        headR: R,
        tipY: cy + R,
        target: d,
        hitR: R + 3,
      });
      return;
    }
    const pin = drawGmapsPin(ctx, x, y - lift, p.pin, p.pinRing, grow, fade);
    boxes.push({
      x,
      y: pin.headCy + lift,
      w: pin.m.w,
      h: pin.m.h,
      headR: pin.m.headR,
      tipY: y,
      target: d,
      hitR: pin.m.headR + 5,
    });
  };

  ctx.save();
  group(unfanned).forEach((g) => {
    if (g.items.length === 1) {
      drawOne(g.items[0].d, g.items[0].x, g.items[0].y);
      return;
    }
    const items = g.items.map((i) => i.d);
    const holdsSelected = !!selected && items.some((d) => d.id === selected.id);
    const cluster: Cluster = {
      id: 'c' + items.map((d) => d.id).join('-'),
      cluster: items,
      lonLat: [mean(items.map((d) => d.lonLat[0])), mean(items.map((d) => d.lonLat[1]))],
      ...clusterLabel(items.length),
    };
    const R = drawCluster(
      ctx,
      g.x,
      g.y,
      items.length,
      holdsSelected ? p.pinSel : p.pin,
      p.pinRing,
      anim.growOf(cluster.id),
    );
    boxes.push({
      x: g.x,
      y: g.y,
      w: R * 2,
      h: R * 2 + HEAD,
      headR: R,
      tipY: g.y + R,
      target: cluster,
      hitR: R + 4,
    });
  });

  // Each ring circles its centroid; at fan 0 every pin is back on its coordinate.
  const e = easeOut(anim.fan);
  rings.forEach((ring) => {
    if (ring.length < 2) return;
    const spots = fanSpots(ring, touch, W, H);
    ring.forEach((q, i) => {
      drawOne(q.d, q.x + (spots[i][0] - q.x) * e, q.y + (spots[i][1] - q.y) * e);
    });
  });

  anim.leaving
    .filter((d) => onFront(S, d.lonLat))
    .forEach((d) => {
      const xy = pr(d.lonLat);
      if (!onStage(xy)) return;
      const [x, tipY] = xy as [number, number];
      const fade = anim.fadeOf(d.id);
      const y = tipY - rise(fade);
      if (isHost(d)) drawHost(ctx, x, y, PIN_EDGE, 0, fade);
      else drawGmapsPin(ctx, x, y, p.pin, p.pinRing, 0, fade);
    });

  hosts.forEach(({ x, y, d }) => {
    const fade = anim.fadeOf(d.id);
    const cy = y - rise(fade);
    const ring = selected?.id === d.id ? p.pinSel : PIN_EDGE;
    const R = drawHost(ctx, x, cy, ring, anim.growOf(d.id), fade);
    boxes.push({ x, y: cy, w: R * 2, h: R * 2, headR: R, tipY: cy + R, target: d, hitR: R });
  });
  ctx.restore();
  return boxes;
}

/**
 * Return the top-most pin under (x, y): boxes are in paint order, hosts last.
 * A miss falls back to the nearest pin within `slop` px (touch).
 */
export function hitPin(boxes: PinBox[], x: number, y: number, slop = 0): PinTarget | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (Math.hypot(b.x - x, b.y - y) <= b.hitR) return b.target;
  }
  let best: PinTarget | null = null;
  let bestDist = slop;
  for (const b of boxes) {
    const dist = Math.hypot(b.x - x, b.y - y);
    if (dist <= bestDist) {
      bestDist = dist;
      best = b.target;
    }
  }
  return best;
}

/** Return the box drawn for `id`, or for the cluster that holds it. */
export const boxFor = (boxes: PinBox[], id: string): PinBox | undefined =>
  boxes.find((b) => b.target.id === id) ??
  boxes.find((b) => isCluster(b.target) && b.target.cluster.some((d) => d.id === id));
