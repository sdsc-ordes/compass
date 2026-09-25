import { geoDistance } from 'd3-geo';
import type { GeoProjection } from 'd3-geo';
import { ASTRONAUT, NIGHT_INK, type Pal } from './palette';
import { frontCentre, REDUCED, type ViewState } from './projection';
import logoUrl from '../assets/www.oceancare.org-192x192.png';
import { isCluster, type Cluster, type PinBox, type PinTarget, type Proj } from './types';

const PIN_EDGE = ASTRONAUT;

const PIN_INK_LIGHT = '#FFFFFF';
const PIN_INK_DARK = NIGHT_INK;

const inkCache = new Map<string, string>();

function inkOn(fill: string): string {
  const held = inkCache.get(fill);
  if (held) return held;
  const m = /^#([0-9a-f]{6})$/i.exec(fill);
  let ink = PIN_INK_LIGHT;
  if (m) {
    const n = parseInt(m[1], 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const lum = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    ink = lum > 0.179 ? PIN_INK_DARK : PIN_INK_LIGHT;
  }
  inkCache.set(fill, ink);
  return ink;
}

const pinMetrics = (sc: number) => ({
  sc,
  headR: 10.5 * sc,
  headOff: 21 * sc,
  w: 24 * sc,
  h: 28 * sc,
});
type PinMetrics = ReturnType<typeof pinMetrics>;

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

export function drawGmapsPin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fill: string,
  edge: string,
  grow: number,
  alpha?: number,
): { headCy: number; m: PinMetrics; tipY: number } {
  const m = pinMetrics(1 + 0.1 * grow);
  const headCy = y - m.headOff;
  ctx.save();
  if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(x, y + 1.5 * m.sc, 5 * m.sc, 1.6 * m.sc, 0, 0, 6.2832);
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
  ctx.arc(x, headCy, 4.2 * m.sc, 0, 6.2832);
  ctx.fillStyle = inkOn(fill);
  ctx.fill();
  ctx.restore();
  return { headCy, m, tipY: y };
}

export function drawCluster(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  n: number,
  fill: string,
  edge: string,
  grow: number,
): number {
  const R = (13 + Math.min(7, n)) * (1 + 0.1 * grow);
  ctx.beginPath();
  ctx.arc(x, y, R + 3, 0, 6.2832);
  ctx.fillStyle = edge;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, 6.2832);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, R + 1.6, 0, 6.2832);
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

export function drawAnchor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  p: Pal,
  grow: number,
  alpha?: number,
): number {
  const sc = 1 + 0.1 * grow;
  const R = 7 * sc;
  const out = R + 2 * sc;
  ctx.save();
  if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, out, 0, 6.2832);
  ctx.fillStyle = p.pinRing;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, 6.2832);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = p.pinSel;
  ctx.lineWidth = 2.5 * sc;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, R + 1.45 * sc, 0, 6.2832);
  ctx.strokeStyle = PIN_EDGE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 2.6 * sc, 0, 6.2832);
  ctx.fillStyle = p.pinSel;
  ctx.fill();
  ctx.restore();
  return out;
}

export const isHost = (d: Proj) => d.typeIri.endsWith('#HostOrganization');

// Lib builds inline this as a data URL, so it resolves on any host page.
let logo: HTMLImageElement | null = null;

function loadLogo(onload: () => void): void {
  if (logo || typeof Image === 'undefined') return;
  logo = new Image();
  logo.onload = onload;
  logo.src = logoUrl;
}

export function drawHost(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ring: string,
  grow: number,
  alpha?: number,
): number {
  const sc = 1 + 0.1 * grow;
  const R = 15 * sc;
  // Same width as the anchor's ring.
  const lw = 2.5 * sc;
  ctx.save();
  if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, 6.2832);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = ring;
  ctx.lineWidth = lw;
  ctx.stroke();
  if (logo?.complete && logo.naturalWidth) {
    const s = 1.3 * R;
    ctx.drawImage(logo, x - s / 2, y - s / 2, s, s);
  }
  ctx.restore();
  return R + lw / 2;
}

export const onFront = (S: ViewState, c: [number, number]) =>
  S.view === 'flat' || geoDistance(c, frontCentre(S)) < 1.52;

const CLUSTER_R = 26;
const HEAD = 21;

interface Group<T> {
  x: number;
  y: number;
  items: T[];
}

// Screen-distance clustering on pin heads.
function group<T extends { hx: number; hy: number }>(pts: T[]): Group<T>[] {
  const recentre = (g: Group<T>) => {
    g.x = mean(g.items.map((i) => i.hx));
    g.y = mean(g.items.map((i) => i.hy));
  };
  const groups: Group<T>[] = [];
  pts.forEach((pt) => {
    const g = groups.find((gg) => Math.hypot(gg.x - pt.hx, gg.y - pt.hy) <= CLUSTER_R);
    if (g) {
      g.items.push(pt);
      recentre(g);
    } else groups.push({ x: pt.hx, y: pt.hy, items: [pt] });
  });
  for (let guard = 0; guard < 8; guard++) {
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

// Ids of the members that still cluster under `pr`, one list per group.
export function fanGroups(pr: GeoProjection, members: Proj[]): string[][] {
  const pts = members.flatMap((d) => {
    const q = pr(d.c);
    return q ? [{ hx: q[0], hy: q[1] - HEAD, id: d.id }] : [];
  });
  return group(pts)
    .filter((g) => g.items.length > 1)
    .map((g) => g.items.map((i) => i.id));
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

const fanGap = (touch: boolean) => (touch ? 44 : 31);
const fanRadius = (n: number, touch: boolean) =>
  fanGap(touch) / (2 * Math.sin(Math.PI / Math.max(2, n))) + 2;

const fanFrom = (n: number) => (n === 2 ? 0 : -Math.PI / 2);

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function fanAngle(ax: number, ay: number, R: number, n: number, W: number, H: number): number {
  const M = 14;
  const from = fanFrom(n);
  let best = from,
    bestOn = -1;
  for (let i = 0; i < 12; i++) {
    const off = from + (i * Math.PI) / 6;
    let on = 0;
    for (let j = 0; j < n; j++) {
      const th = off + (j * 2 * Math.PI) / n;
      const x = ax + Math.cos(th) * R,
        y = ay + Math.sin(th) * R;
      if (x > M && x < W - M && y - 21 > M && y < H - M) on++;
    }
    if (on > bestOn) {
      bestOn = on;
      best = off;
    }
  }
  return best;
}

interface Anim {
  grow: number;
  growTo: number;
  fade: number;
  fadeTo: number;
}

const emphasis = (id: string, selectedId: string | null, hoveredId: string | null) =>
  id === selectedId || id === hoveredId ? 1 : 0;

export class PinAnimator {
  private anim = new Map<string, Anim>();
  private frame: number | null = null;
  live: Proj[] = [];
  leaving: Proj[] = [];
  private known = new Map<string, Proj>();
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  fan = 0;
  private fanTo = 0;
  // The clicked cluster's still-overlapping groups, kept until the fan has closed.
  fanSets: string[][] = [];
  fanIds = new Set<string>();

  constructor(
    private paint: () => void,
    private settled: () => void = () => {},
  ) {
    loadLogo(paint);
  }

  private of(id: string): Anim {
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

  openFan(sets: string[][]): void {
    this.fanSets = sets;
    this.fanIds = new Set(sets.flat());
    this.fan = 0;
    this.setFan(1);
  }

  closeFan(): void {
    if (this.fanIds.size) this.setFan(0);
  }

  private setFan(to: number): void {
    this.fanTo = to;
    if (REDUCED.matches) {
      this.landFan();
      this.paint();
      this.settled();
      return;
    }
    this.kick();
  }

  private landFan(): void {
    this.fan = this.fanTo;
    if (this.fan) return;
    this.fanSets = [];
    this.fanIds.clear();
  }

  private kick(): void {
    if (this.frame !== null) return;
    const loop = () => {
      const moving = this.step();
      this.paint();
      this.frame = moving ? requestAnimationFrame(loop) : null;
      if (!moving) this.settled();
    };
    this.frame = requestAnimationFrame(loop);
  }

  roster(visible: Proj[]): void {
    const liveIds = new Set(visible.map((d) => d.id));
    visible.forEach((d) => {
      this.known.set(d.id, d);
      this.of(d.id).fadeTo = 1;
    });
    this.known.forEach((d, id) => {
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
      (['grow', 'fade'] as const).forEach((kk) => {
        const to = a[(kk + 'To') as 'growTo' | 'fadeTo'];
        if (Math.abs(to - a[kk]) < 0.006) a[kk] = to;
        else {
          a[kk] += (to - a[kk]) * 0.22;
          moving = true;
        }
      });
      if (a.fade === 0 && a.fadeTo === 0 && a.grow === 0) this.anim.delete(id);
    });
    if (Math.abs(this.fanTo - this.fan) < 0.006) this.landFan();
    else {
      this.fan += (this.fanTo - this.fan) * 0.22;
      moving = true;
    }
    return moving;
  }

  pump(visible: Proj[], selectedId: string | null, hoveredId: string | null): void {
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
    this.kick();
  }

  stop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}

export interface DrawPinsArgs {
  ctx: CanvasRenderingContext2D;
  pr: GeoProjection;
  W: number;
  H: number;
  p: Pal;
  S: ViewState;
  anim: PinAnimator;
  visible: Proj[];
  selected: Proj | null;
  touch: boolean;
  clusterLabel: (n: number) => { title: string; where: string };
}

export function drawPins(a: DrawPinsArgs): PinBox[] {
  const { ctx, pr, W, H, p, S, anim, selected } = a;
  anim.roster(a.visible);
  const pinbox: PinBox[] = [];
  const onStage = (xy: [number, number] | null) =>
    !!xy && !isNaN(xy[0]) && xy[0] > -30 && xy[0] < W + 30 && xy[1] > -30 && xy[1] < H + 30;
  const pts: { x: number; y: number; hx: number; hy: number; d: Proj }[] = [];
  const hosts: typeof pts = [];
  const fanned = new Map<string, (typeof pts)[number]>();
  anim.live
    .filter((d) => onFront(S, d.c))
    .forEach((d) => {
      const xy = pr(d.c);
      if (!onStage(xy)) return;
      const q = xy as [number, number];
      const pt = { x: q[0], y: q[1], hx: q[0], hy: q[1] - HEAD, d };
      if (isHost(d)) hosts.push(pt);
      else if (anim.fanIds.has(d.id)) fanned.set(d.id, pt);
      else pts.push(pt);
    });
  const rings = anim.fanSets.map((ids) => ids.flatMap((id) => fanned.get(id) ?? []));
  rings.filter((ring) => ring.length < 2).forEach((ring) => pts.push(...ring));

  // Tip at (x, y); `rise` lifts a pin that is fading in or out.
  const drawOne = (d: Proj, x: number, y: number) => {
    const grow = anim.growOf(d.id),
      fade = anim.fadeOf(d.id);
    const rise = (1 - fade) * 7;
    if (selected?.id === d.id) {
      const cy = y - rise;
      const R = drawAnchor(ctx, x, cy, p, grow, fade);
      pinbox.push({ x, y: cy, w: R * 2, h: R * 2, headR: R, tipY: cy + R, p: d, r: R + 3 });
      return;
    }
    const pin = drawGmapsPin(ctx, x, y - rise, p.pin, p.pinRing, grow, fade);
    pinbox.push({
      x,
      y: pin.headCy + rise,
      w: pin.m.w,
      h: pin.m.h,
      headR: pin.m.headR,
      tipY: pin.tipY + rise,
      p: d,
      r: pin.m.headR + 5,
    });
  };

  ctx.save();
  group(pts).forEach((g) => {
    if (g.items.length === 1) {
      drawOne(g.items[0].d, g.items[0].x, g.items[0].y);
      return;
    }
    const items = g.items.map((i) => i.d);
    const holds = !!selected && items.some((d) => d.id === selected.id);
    const cl: Cluster = {
      id: 'c' + items.map((d) => d.id).join('-'),
      cluster: items,
      c: [mean(items.map((d) => d.c[0])), mean(items.map((d) => d.c[1]))],
      ...a.clusterLabel(items.length),
      txt: items.map((d) => d.title).join(' · '),
    };
    const R = drawCluster(
      ctx,
      g.x,
      g.y,
      items.length,
      holds ? p.pinSel : p.pin,
      p.pinRing,
      anim.growOf(cl.id),
    );
    pinbox.push({
      x: g.x,
      y: g.y,
      w: R * 2,
      h: R * 2 + HEAD,
      headR: R,
      tipY: g.y + R,
      p: cl,
      r: R + 4,
    });
  });

  // Each ring circles its centroid; at fan 0 every pin is back on its coordinate.
  const e = easeOut(anim.fan);
  rings.forEach((ring) => {
    const n = ring.length;
    if (n < 2) return;
    const ax = mean(ring.map((q) => q.x)),
      ay = mean(ring.map((q) => q.y));
    const R = fanRadius(n, a.touch);
    const a0 = fanAngle(ax, ay, R, n, W, H);
    ring.forEach((q, i) => {
      const th = a0 + (i * 2 * Math.PI) / n;
      drawOne(
        q.d,
        q.x + (ax + Math.cos(th) * R - q.x) * e,
        q.y + (ay + Math.sin(th) * R - q.y) * e,
      );
    });
  });

  anim.leaving
    .filter((d) => onFront(S, d.c))
    .forEach((d) => {
      const xy = pr(d.c);
      if (!onStage(xy)) return;
      const q = xy as [number, number];
      const y = q[1] - (1 - anim.fadeOf(d.id)) * 7;
      if (isHost(d)) drawHost(ctx, q[0], y, PIN_EDGE, 0, anim.fadeOf(d.id));
      else drawGmapsPin(ctx, q[0], y, p.pin, p.pinRing, 0, anim.fadeOf(d.id));
    });

  hosts.forEach(({ x, y, d }) => {
    const fade = anim.fadeOf(d.id);
    const cy = y - (1 - fade) * 7;
    const on = !!selected && selected.id === d.id;
    const R = drawHost(ctx, x, cy, on ? p.pinSel : PIN_EDGE, anim.growOf(d.id), fade);
    pinbox.push({ x, y: cy, w: R * 2, h: R * 2, headR: R, tipY: cy + R, p: d, r: R });
  });
  ctx.restore();
  return pinbox;
}

// Top-most first: pinbox is in paint order, hosts last.
export function hitPin(pinbox: PinBox[], x: number, y: number): PinTarget | null {
  for (let i = pinbox.length - 1; i >= 0; i--) {
    const b = pinbox[i];
    if (Math.hypot(b.x - x, b.y - y) <= b.r) return b.p;
  }
  return null;
}

export const boxFor = (pinbox: PinBox[], id: string): PinBox | undefined =>
  pinbox.find((b) => b.p.id === id) ??
  pinbox.find((b) => isCluster(b.p) && b.p.cluster.some((d) => d.id === id));
