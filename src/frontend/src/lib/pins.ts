/**
 * Pins: the roster the filters leave standing, clustering, drawing and hit-testing.
 *
 * The animation lives in its own frame loop, because pins are cheap and the map
 * is not: a full stage render costs ~200 ms, nearly all of it in placeLabels()
 * measuring and placing, while drawPins costs a tenth of a millisecond and the
 * basemap is SVG that no pin touches. Emphasis and fades repaint the canvas
 * alone and leave the rest of the map alone.
 */
import { geoDistance } from 'd3-geo';
import type { GeoProjection } from 'd3-geo';
import type { Pal } from './palette';
import { frontCentre, K_MAX, REDUCED, type ViewState } from './projection';
import { isCluster, type Cluster, type PinBox, type PinTarget, type Proj } from './types';

/* Google Maps–style teardrop pin; (x,y) is the ground anchor at the tip. */
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
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.12)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, headCy, 4.2 * m.sc, 0, 6.2832);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();
  return { headCy, m, tipY: y };
}

/** One disc standing in for several pins, carrying the count. */
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
  ctx.fillStyle = '#fff';
  ctx.font = '700 ' + (n > 9 ? 12 : 13) + 'px Cabin, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), x, y + 0.5);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  return R;
}

/** Once the card has taken over, the spot only needs marking. Coral, because
    that is what the selection is marked in everywhere else on the map. */
export function drawAnchor(ctx: CanvasRenderingContext2D, x: number, y: number, p: Pal): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, 6.2832);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = p.pinSel;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 2.6, 0, 6.2832);
  ctx.fillStyle = p.pinSel;
  ctx.fill();
  ctx.restore();
}

export const onFront = (S: ViewState, c: [number, number]) =>
  S.view === 'flat' || geoDistance(c, frontCentre(S)) < 1.52;

/** Pins closer together than this on screen would overlap illegibly, so they merge. */
const CLUSTER_R = 26;

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

/**
 * How far a fanned member's tip sits from the ring's centre.
 *
 * Kept as tight as the geometry allows, because nothing draws the shared point
 * any more: at max zoom the radius maps to real ground distance, so every pixel
 * of ring is a pixel of lie about where these entities are. On a 1000px stage
 * 24px is already ~110 km, and on a 390px one ~260 km.
 *
 * One constraint sets it. Adjacent heads sit 2R·sin(π/n) apart — heads and tips
 * share the same separation, since a head is a fixed 21px above its own tip — and
 * that has to clear two hit circles, which are `headR + 5` = 15.5px each. So
 * 31px for a cursor. A finger wants a 44px target instead. Solving for R gives
 * the ring the smallest radius that keeps every member separately clickable.
 */
const fanGap = (touch: boolean) => (touch ? 44 : 31);
const fanRadius = (n: number, touch: boolean) =>
  fanGap(touch) / (2 * Math.sin(Math.PI / Math.max(2, n))) + 2;

/**
 * Where the ring starts.
 *
 * Three or more begin straight up and go clockwise, a cardinal layout that reads
 * as deliberate and at n=4 puts one member on each side. A pair goes side by
 * side rather than stacked: two teardrops one above the other read as one tall
 * smear, and four of the six real coincident groups are pairs, so this is the
 * case that has to look right.
 */
const fanFrom = (n: number) => (n === 2 ? 0 : -Math.PI / 2);

/** Opens quickly and settles, rather than arriving at speed. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * True once the map has nothing left to zoom.
 *
 * The whole trigger for fanning. At max zoom no further zoom is available, so
 * any group still holding two or more members is unresolvable by definition and
 * spreads instead — which is why there is no coordinate test anywhere here any
 * more. Testing purity was the old bug: a group of coincident pins that had
 * merged with any neighbour within CLUSTER_R + 8 stopped counting as one and
 * silently never fanned, which on a phone-sized stage killed three of the six
 * real groups outright.
 *
 * Compared with slack, because `k` arrives from a tween and from `S.k * f`
 * products that need not land exactly on the ceiling.
 */
export const atMaxZoom = (S: ViewState) => S.k >= K_MAX - 1e-6;

/**
 * Rotates the ring to whichever offset keeps the most heads on stage.
 *
 * A group hard against an edge cannot be fixed by rotation alone — a ring
 * reaches R in every direction — but this stops one from throwing half its
 * members off a corner. Ties keep the base angle, so nothing rotates without
 * cause. Much less pressing than it was: the radius is now less than half what
 * it used to be, so far fewer rings reach an edge at all.
 */
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
      /* The head, not the tip: the head is the part that has to stay readable. */
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

/** Full for the selected pin and the hovered one, none for the rest. */
const emphasis = (id: string, selectedId: string | null, hoveredId: string | null) =>
  id === selectedId || id === hoveredId ? 1 : 0;

/** Eases emphasis and fades, and knows which pins are on their way out. */
export class PinAnimator {
  private anim = new Map<string, Anim>();
  private frame: number | null = null;
  /** Everything the filters allow. */
  live: Proj[] = [];
  /** Still fading out after the filters excluded them. */
  leaving: Proj[] = [];
  /** Everything drawn at least once, so a pin the filters just excluded can still
      be faded out — the roster alone no longer contains it. */
  private known = new Map<string, Proj>();
  /** Held as state, not captured by the frame loop, which outlives any one of them. */
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  /**
   * How far open the fans are, 0 to 1.
   *
   * One value for every fan on the stage, because they all key off a single
   * condition — the map sitting at max zoom — and so open and close together.
   * It lives here rather than in Stage because this class already owns the frame
   * loop pins ease on, and because drawPins has to read it.
   */
  fan = 0;
  private fanTo = 0;

  constructor(private paint: () => void) {}

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

  /**
   * Opens or closes every fan.
   *
   * The only writer of `fan` and `fanTo`, and deliberately so. The previous pass
   * had a second one that zeroed the value without the target, and a loop still
   * in flight then eased the fan straight back open. Keeping one writer that
   * always sets both makes that class of bug unreachable rather than guarded.
   */
  setFan(open: boolean): void {
    this.fanTo = open ? 1 : 0;
    if (REDUCED.matches) {
      /* Reduced motion means no motion, not quicker motion. */
      this.fan = this.fanTo;
      this.paint();
      return;
    }
    this.kick();
  }

  /** Starts the frame loop unless one is already in flight — a loop already
      running picks new targets up on its next frame. */
  private kick(): void {
    if (this.frame !== null) return;
    const loop = () => {
      const moving = this.step();
      this.paint();
      this.frame = moving ? requestAnimationFrame(loop) : null;
    };
    this.frame = requestAnimationFrame(loop);
  }

  /** Who should be drawn: everything the filters allow, plus whatever is still fading out. */
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
    /* Nothing left animating and nothing selecting it: stop remembering it. */
    this.known.forEach((_d, id) => {
      if (!liveIds.has(id) && !this.anim.has(id)) this.known.delete(id);
    });
  }

  /** Eases every value toward its target and reports whether anything is still moving. */
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
    /* Eased on the same loop and counted in `moving`, so a fan opening over
       pins that are already at rest still gets its frames. */
    if (Math.abs(this.fanTo - this.fan) < 0.006) this.fan = this.fanTo;
    else {
      this.fan += (this.fanTo - this.fan) * 0.22;
      moving = true;
    }
    return moving;
  }

  /** Sets every fade target, then runs the loop until nothing is moving. */
  pump(visible: Proj[], selectedId: string | null, hoveredId: string | null): void {
    this.selectedId = selectedId;
    this.hoveredId = hoveredId;
    this.roster(visible);
    if (REDUCED.matches) {
      /* Reduced motion means no motion, not quicker motion: straight to target. */
      this.anim.forEach((a, id) => {
        a.growTo = emphasis(id, selectedId, hoveredId);
        a.grow = a.growTo;
        a.fade = a.fadeTo;
      });
      this.fan = this.fanTo;
      this.paint();
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
  /** Everything the filters leave standing, for the roster pass below. */
  visible: Proj[];
  selected: Proj | null;
  /** True while the close-range project card has taken over from the pin. */
  cardShowing: boolean;
  /** Fans wider for a finger than for a cursor. */
  touch: boolean;
  /** i18n for a counted disc's two lines — the prototype hard-coded English here. */
  clusterLabel: (n: number) => { title: string; where: string };
}

/** Teardrop pins, tip on the coordinate. Anything that would collide at this
    scale is drawn once as a counted disc — until the map runs out of zoom, where
    a disc would be advising the impossible and its members spread instead. */
export function drawPins(a: DrawPinsArgs): PinBox[] {
  const { ctx, pr, W, H, p, S, anim, selected } = a;
  /* Re-rostered every draw, not only on filter changes: stepAnim drops a pin's
     record the moment it finishes fading, and a stale roster then kept drawing
     excluded pins at full opacity, unclustered and unclickable. */
  anim.roster(a.visible);
  const pinbox: PinBox[] = [];
  /* Grouped in head space: a pin's head sits a whole pin above its anchor, so
     anchors that look far apart can still collide. */
  const HEAD = 21;
  const onStage = (xy: [number, number] | null) =>
    !!xy && !isNaN(xy[0]) && xy[0] > -30 && xy[0] < W + 30 && xy[1] > -30 && xy[1] < H + 30;
  const card = a.cardShowing;
  /* Any fan at all, open or still easing shut. Read once: every fan on the stage
     shares one openness, so this governs all of them. */
  const fanning = anim.fan > 0.002;
  const pts: { x: number; y: number; hx: number; hy: number; d: Proj }[] = [];
  anim.live
    .filter((d) => onFront(S, d.c))
    .forEach((d) => {
      const xy = pr(d.c);
      if (!onStage(xy)) return;
      const q = xy as [number, number];
      /* Everything is grouped, the selected project included. It used to be pulled
       out here so the card could replace its pin, but a selected member of a fan
       has to stay in the ring — losing it the instant one is picked is exactly
       when the visitor wants the others still in reach. So the card's bare anchor
       is decided after grouping instead, where "did it end up in a fan" is known. */
      pts.push({ x: q[0], y: q[1], hx: q[0], hy: q[1] - HEAD, d });
    });

  interface Group {
    x: number;
    y: number;
    items: typeof pts;
  }
  const recentre = (g: Group) => {
    g.x = mean(g.items.map((i) => i.hx));
    g.y = mean(g.items.map((i) => i.hy));
  };
  const groups: Group[] = [];
  pts.forEach((pt) => {
    const g = groups.find((gg) => Math.hypot(gg.x - pt.hx, gg.y - pt.hy) <= CLUSTER_R);
    if (g) {
      g.items.push(pt);
      recentre(g);
    } else groups.push({ x: pt.hx, y: pt.hy, items: [pt] });
  });
  /* One pass leaves centroids that drifted back within touching distance. */
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

  ctx.save();
  groups.forEach((g) => {
    if (g.items.length === 1) {
      const d = g.items[0].d;
      const on = !!selected && selected.id === d.id;
      /* Alone and holding the card, so the card states it and the spot only needs
         marking. Decided here rather than before grouping: while fanning, the
         selected pin has to stay in the ring, and whether it ended up in one is
         not known until the groups are built. */
      if (card && on) {
        const q = g.items[0];
        drawAnchor(ctx, q.x, q.y, p);
        pinbox.push({ x: q.x, y: q.y, w: 18, h: 18, headR: 9, tipY: q.y + 9, p: d, r: 12 });
        return;
      }
      const grow = anim.growOf(d.id),
        fade = anim.fadeOf(d.id);
      /* A pin arriving drops the last few pixels into place as it fades up. */
      const rise = (1 - fade) * 7;
      /* Selection outranks type, so coral keeps meaning "this one". */
      const pin = drawGmapsPin(
        ctx,
        g.items[0].x,
        g.items[0].y - rise,
        on ? p.pinSel : p.pin,
        p.pinRing,
        grow,
        fade,
      );
      pinbox.push({
        x: g.items[0].x,
        y: pin.headCy + rise,
        w: pin.m.w,
        h: pin.m.h,
        headR: pin.m.headR,
        tipY: pin.tipY + rise,
        p: d,
        r: pin.m.headR + 5,
      });
      return;
    }
    const items = g.items.map((i) => i.d);
    const holds = !!selected && items.some((d) => d.id === selected.id);

    /* Out of zoom, so this group is as separated as the map can make it: spread
       its members instead of drawing a disc that invites a zoom there is none of.

       Nothing marks the point they came from. That is deliberate — the user did
       not want an indication they share a spot — and it is why fanRadius is kept
       at the bare minimum that keeps the heads clickable, since with no origin to
       refer back to, every pixel of ring reads as real distance. */
    if (fanning) {
      /* The group's centroid in head space, put back into tip space. */
      const ax = g.x,
        ay = g.y + HEAD;
      const R = fanRadius(items.length, a.touch) * easeOut(anim.fan);
      const a0 = fanAngle(ax, ay, R, items.length, W, H);
      items.forEach((d, i) => {
        const th = a0 + (i * 2 * Math.PI) / items.length;
        const x = ax + Math.cos(th) * R,
          y = ay + Math.sin(th) * R;
        const on = !!selected && selected.id === d.id;
        const pin = drawGmapsPin(
          ctx,
          x,
          y,
          on ? p.pinSel : p.pin,
          p.pinRing,
          anim.growOf(d.id),
          anim.fadeOf(d.id),
        );
        pinbox.push({
          x,
          y: pin.headCy,
          w: pin.m.w,
          h: pin.m.h,
          headR: pin.m.headR,
          tipY: pin.tipY,
          p: d,
          r: pin.m.headR + 5,
        });
      });
      return;
    }

    const cl: Cluster = {
      id: 'c' + items.map((d) => d.id).join('-'),
      cluster: items,
      c: [mean(items.map((d) => d.c[0])), mean(items.map((d) => d.c[1]))],
      ...a.clusterLabel(items.length),
      txt: items.map((d) => d.title).join(' · '),
    };
    /* A cluster stays neutral even when its members share a type. */
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

  /* Excluded pins linger a few frames on the way out. Drawn, but never entered
     into the hit boxes, so nothing can be clicked on its way out. */
  anim.leaving
    .filter((d) => onFront(S, d.c))
    .forEach((d) => {
      const xy = pr(d.c);
      if (!onStage(xy)) return;
      const q = xy as [number, number];
      drawGmapsPin(
        ctx,
        q[0],
        q[1] - (1 - anim.fadeOf(d.id)) * 7,
        p.pin,
        p.pinRing,
        0,
        anim.fadeOf(d.id),
      );
    });
  ctx.restore();
  return pinbox;
}

export function hitPin(pinbox: PinBox[], x: number, y: number): PinTarget | null {
  let hit: PinTarget | null = null,
    hd = 1e9;
  pinbox.forEach((b) => {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d <= b.r && d < hd) {
      hd = d;
      hit = b.p;
    }
  });
  return hit;
}

/** A keyboard-reached entry may be inside a cluster rather than on a pin of its
    own, so fall back to the disc standing in for it. */
export const boxFor = (pinbox: PinBox[], id: string): PinBox | undefined =>
  pinbox.find((b) => b.p.id === id) ??
  pinbox.find((b) => isCluster(b.p) && b.p.cluster.some((d) => d.id === id));
