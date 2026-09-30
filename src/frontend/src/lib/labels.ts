import { geoContains, geoDistance } from 'd3-geo';
import type { GeoPermissibleObjects, GeoProjection } from 'd3-geo';
import type { Lang } from './i18n';
import type { Palette } from './palette';
import { frontCentre, type ViewState } from './projection';
import type { PinBox } from './types';

// One entry of src/atlas-labels.json (scripts/build-atlas.mjs).
export interface MapLabel {
  en: string;
  de: string;
  // Zoom from which the label is shown.
  k: number;
  // [lon, lat]
  c: [number, number];
}

export interface SeaLabel extends MapLabel {
  // Size tier: 0 ocean, 1 sea, 2 gulf or strait.
  t: number;
}

interface LabelPass {
  pr: GeoProjection;
  W: number;
  H: number;
  p: Palette;
  S: ViewState;
  ov: HTMLElement;
  pinbox: PinBox[];
  keepOut: { x: number; y: number; w: number; h: number }[];
  measureCtx: CanvasRenderingContext2D;
  cty: MapLabel[];
  sea: SeaLabel[];
  land: GeoPermissibleObjects;
  lang: Lang;
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

// Label colour over the depth raster, which is dark in both themes. No halo:
// at fractional positions one reads as a smear.
const SEA_INK = '#FFFFFF';

// Zoom from which country labels replace the continent labels.
const COUNTRY_K = 2;

const CONTINENTS: Omit<MapLabel, 'k'>[] = [
  { en: 'Africa', de: 'Afrika', c: [20, 5] },
  { en: 'Asia', de: 'Asien', c: [90, 45] },
  { en: 'Europe', de: 'Europa', c: [18, 50] },
  { en: 'North America', de: 'Nordamerika', c: [-100, 48] },
  { en: 'South America', de: 'Südamerika', c: [-58, -15] },
  { en: 'Oceania', de: 'Ozeanien', c: [140, -25] },
  { en: 'Antarctica', de: 'Antarktis', c: [0, -80] },
];

/** Replace the label overlay's contents with the labels that fit this frame. */
export function placeLabels(pass: LabelPass): void {
  const { pr, W, H, p, S, ov, measureCtx, land, lang, depth } = pass;
  ov.textContent = '';
  const globe = S.view === 'globe';
  const centre = frontCentre(S);
  const boxes: { x: number; y: number; w: number; h: number }[] = pass.pinbox
    .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }))
    .concat(pass.keepOut);

  const measure = (text: string, style: Style) => {
    const ctx = measureCtx;
    ctx.save();
    ctx.font = `${style.weight} ${style.size}px ${FACE}`;
    const em = style.track * style.size;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${em}px`;
    const w = ctx.measureText(style.caps ? text.toUpperCase() : text).width;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.restore();
    return w + ('letterSpacing' in ctx ? 0 : em * text.length) + 6;
  };

  // Whether a label of width w centred on (x, y) is clear of land, sampled at
  // four points across its width. A point that does not invert cleanly (past
  // the globe's limb) counts as land.
  const overWater = (x: number, y: number, w: number) => {
    for (const f of [-0.44, -0.2, 0.2, 0.44]) {
      const px = x + w * f;
      const ll = pr.invert?.([px, y]);
      if (!ll || isNaN(ll[0]) || geoContains(land, ll)) return false;
      const back = pr(ll);
      if (!back || Math.hypot(back[0] - px, back[1] - y) > 1) return false;
    }
    return true;
  };

  const place = (c: [number, number], className: string, text: string, atSea: boolean) => {
    const style = STYLES[className];
    const w = measure(text, style);
    if (globe && geoDistance(c, centre) > 1.24) return false;
    const xy = pr(c);
    if (!xy || isNaN(xy[0])) return false;
    const [x, y] = xy;
    if (x - w / 2 < 8 || x + w / 2 > W - 8 || y < 16 || y > H - 16) return false;
    const pad = atSea ? 5 : 4;
    if (
      boxes.some(
        (b) =>
          Math.abs(b.x - x) < (b.w + w) / 2 + pad &&
          Math.abs(b.y - y) < (b.h + style.h) / 2 + pad,
      )
    )
      return false;
    // Sea labels must clear the coast. Any label that does, over the depth
    // raster, takes SEA_INK: e.g. an island's name set wider than the island.
    const wet = atSea || depth ? overWater(x, y, w) : false;
    if (atSea && !wet) return false;
    const overRaster = wet && depth;
    boxes.push({ x, y, w, h: style.h });
    const el = document.createElement('div');
    el.className = 'lbl ' + className;
    el.style.cssText +=
      `left:${x}px;top:${y}px;color:${overRaster ? SEA_INK : p.lblCty};font-size:${style.size}px;` +
      `font-weight:${style.weight};letter-spacing:${style.track}em;` +
      (style.caps ? 'text-transform:uppercase;' : '');
    el.textContent = text;
    ov.appendChild(el);
    return true;
  };

  // Continents first, so they win every collision.
  if (S.k < COUNTRY_K) CONTINENTS.forEach((d) => place(d.c, 'lbl-con', d[lang], false));
  // Natural Earth splits the Atlantic and the Pacific in two, under one name each.
  const named = new Set<string>();
  pass.sea.forEach((d) => {
    const text = d[lang];
    if (S.k >= d.k && !named.has(text) && place(d.c, 'lbl-sea' + d.t, text, true))
      named.add(text);
  });
  pass.cty.forEach((d) => {
    if (S.k >= COUNTRY_K && S.k >= d.k) place(d.c, 'lbl-cty', d[lang], false);
  });
}
