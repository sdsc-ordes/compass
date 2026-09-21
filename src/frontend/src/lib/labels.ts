import { geoContains, geoDistance } from 'd3-geo';
import type { GeoPermissibleObjects, GeoProjection } from 'd3-geo';
import type { Pal } from './palette';
import { frontCentre, type ViewState } from './projection';
import type { PinBox } from './types';

export interface MapLabel {
  en: string;
  de: string;
  k: number;
  c: [number, number];
}

export interface SeaLabel extends MapLabel {
  t: number;
}

export interface LabelPass {
  pr: GeoProjection;
  W: number;
  H: number;
  p: Pal;
  S: ViewState;
  ov: HTMLElement;
  pinbox: PinBox[];
  keepOut: { x: number; y: number; w: number; h: number }[];
  measureCtx: CanvasRenderingContext2D;
  cty: MapLabel[];
  sea: SeaLabel[];
  land: GeoPermissibleObjects;
  lang: 'en' | 'de';
  depth: boolean;
}

interface Style {
  size: number;
  weight: number;
  track: number;
  caps: boolean;
  h: number;
}

const STYLES: Record<string, Style> = {
  'lbl-cty': { size: 11.5, weight: 600, track: 0.02, caps: false, h: 14 },
  'lbl-con': { size: 11.5, weight: 700, track: 0.2, caps: true, h: 15 },
  'lbl-sea0': { size: 11.5, weight: 700, track: 0.2, caps: true, h: 15 },
  'lbl-sea1': { size: 10.5, weight: 600, track: 0.08, caps: false, h: 14 },
  'lbl-sea2': { size: 10, weight: 400, track: 0.05, caps: false, h: 13 },
};

const FACE = 'Cabin, system-ui, sans-serif';

const SEA_INK = '#FFFFFF';

/* Below this k continents are the only land labels, above it the countries are. */
const CON_K = 2;

const CON: Omit<MapLabel, 'k'>[] = [
  { en: 'Africa', de: 'Afrika', c: [20, 5] },
  { en: 'Asia', de: 'Asien', c: [90, 45] },
  { en: 'Europe', de: 'Europa', c: [18, 50] },
  { en: 'North America', de: 'Nordamerika', c: [-100, 48] },
  { en: 'South America', de: 'Südamerika', c: [-58, -15] },
  { en: 'Oceania', de: 'Ozeanien', c: [140, -25] },
  { en: 'Antarctica', de: 'Antarktis', c: [0, -80] },
];

export function placeLabels(a: LabelPass): void {
  const { pr, W, H, p, S, ov, measureCtx: cx } = a;
  ov.textContent = '';
  const k = S.k,
    globe = S.view === 'globe';
  const ctr = frontCentre(S);
  const boxes: { x: number; y: number; w: number; h: number }[] = a.pinbox
    .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }))
    .concat(a.keepOut);

  const measure = (txt: string, st: Style) => {
    cx.save();
    cx.font = `${st.weight} ${st.size}px ${FACE}`;
    const em = st.track * st.size;
    if ('letterSpacing' in cx) cx.letterSpacing = `${em}px`;
    const w = cx.measureText(st.caps ? txt.toUpperCase() : txt).width;
    if ('letterSpacing' in cx) cx.letterSpacing = '0px';
    cx.restore();
    return w + ('letterSpacing' in cx ? 0 : em * txt.length) + 6;
  };

  const place = (
    c: [number, number],
    cls: string,
    txt: string,
    ink: string,
    atSea: boolean,
  ) => {
    const st = STYLES[cls];
    const w = measure(txt, st);
    if (globe && geoDistance(c, ctr) > 1.24) return false;
    const xy = pr(c);
    if (!xy || isNaN(xy[0])) return false;
    const [x, y] = xy;
    if (x - w / 2 < 8 || x + w / 2 > W - 8 || y < 16 || y > H - 16) return false;
    const pad = atSea ? 5 : 4;
    if (
      boxes.some(
        (b) =>
          Math.abs(b.x - x) < (b.w + w) / 2 + pad && Math.abs(b.y - y) < (b.h + st.h) / 2 + pad,
      )
    )
      return false;
    if (atSea) {
      for (const f of [-0.44, -0.2, 0.2, 0.44]) {
        const px = x + w * f;
        const ll = pr.invert?.([px, y]);
        if (!ll || isNaN(ll[0]) || geoContains(a.land, ll)) return false;
        const back = pr(ll);
        if (!back || Math.hypot(back[0] - px, back[1] - y) > 1) return false;
      }
    }
    boxes.push({ x, y, w, h: st.h });
    const el = document.createElement('div');
    el.className = 'lbl ' + cls;
    el.style.cssText +=
      `left:${x}px;top:${y}px;color:${ink};font-size:${st.size}px;` +
      `font-weight:${st.weight};letter-spacing:${st.track}em;` +
      (st.caps ? 'text-transform:uppercase;' : '');
    el.textContent = txt;
    ov.appendChild(el);
    return true;
  };

  // Placed first so the continents win every collision they are in.
  if (k < CON_K)
    CON.forEach((d) => place(d.c, 'lbl-con', a.lang === 'de' ? d.de : d.en, p.lblCty, false));
  const seaInk = a.depth ? SEA_INK : p.lblCty;
  // Natural Earth splits the Atlantic and the Pacific in two, under one name each.
  const named = new Set<string>();
  a.sea.forEach((d) => {
    const txt = a.lang === 'de' ? d.de : d.en;
    if (k >= d.k && !named.has(txt) && place(d.c, 'lbl-sea' + d.t, txt, seaInk, true))
      named.add(txt);
  });
  a.cty.forEach((d) => {
    if (k >= CON_K && k >= d.k)
      place(d.c, 'lbl-cty', a.lang === 'de' ? d.de : d.en, p.lblCty, false);
  });
}
