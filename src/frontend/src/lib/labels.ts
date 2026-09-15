import { geoDistance } from 'd3-geo';
import type { GeoProjection } from 'd3-geo';
import type { Pal } from './palette';
import { frontCentre, type ViewState } from './projection';
import type { PinBox } from './types';

export const CTY_MIN: [string, number][] = [
  ['Russia', 0],
  ['Canada', 0],
  ['China', 0],
  ['United States of America', 0],
  ['Brazil', 0],
  ['Australia', 0],
  ['India', 0],
  ['Argentina', 0],
  ['Kazakhstan', 1],
  ['Algeria', 1],
  ['Greenland', 0],
  ['Saudi Arabia', 1],
  ['Mexico', 0],
  ['Indonesia', 0],
  ['Libya', 1],
  ['Iran', 1],
  ['Mongolia', 1],
  ['Peru', 1],
  ['Chad', 1.5],
  ['Niger', 1.5],
  ['Angola', 1.5],
  ['Mali', 1.5],
  ['South Africa', 1],
  ['Colombia', 1],
  ['Ethiopia', 1.5],
  ['Bolivia', 1.5],
  ['Egypt', 1],
  ['Turkey', 1],
  ['France', 1],
  ['Spain', 1.3],
  ['Sweden', 1.3],
  ['Norway', 1.3],
  ['Germany', 1.3],
  ['Japan', 1],
  ['Thailand', 1.5],
  ['Kenya', 1.5],
  ['Nigeria', 1.3],
  ['Chile', 1],
  ['New Zealand', 1.2],
  ['Somalia', 1.6],
  ['Namibia', 1.6],
  ['Sudan', 1.4],
  ['Ukraine', 1.6],
  ['Morocco', 1.6],
  ['Venezuela', 1.5],
  ['Zambia', 2],
  ['Myanmar', 1.8],
  ['Afghanistan', 1.8],
  ['Pakistan', 1.4],
  ['Portugal', 2],
  ['Italy', 1.4],
  ['Poland', 1.8],
  ['United Kingdom', 1.4],
  ['Ireland', 2],
  ['Iceland', 1.6],
  ['Vietnam', 1.8],
  ['Philippines', 1.4],
  ['Malaysia', 1.8],
  ['Papua New Guinea', 1.6],
  ['Madagascar', 1.4],
  ['Mozambique', 1.8],
  ['Tanzania', 1.6],
  ['Ghana', 2],
  ['Senegal', 2],
  ['Oman', 1.8],
  ['Yemen', 1.8],
  ['Iraq', 1.8],
  ['Uruguay', 2],
  ['Ecuador', 1.8],
  ['Cuba', 1.8],
  ['Greece', 1.8],
  ['Croatia', 2.4],
  ['Tunisia', 2.2],
  ['W. Sahara', 2.4],
];

export interface CountryLabel {
  name: string;
  minK: number;
  c: [number, number];
  area: number;
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
  cty: CountryLabel[];
}

const CTY_FONT = '600 11.5px Cabin, system-ui, sans-serif';
const CTY_TRACKING = 0.23;

export function placeLabels(a: LabelPass): void {
  const { pr, W, H, p, S, ov, measureCtx: cx } = a;
  ov.textContent = '';
  const k = S.k,
    globe = S.view === 'globe';
  const ctr = frontCentre(S);
  const boxes: { x: number; y: number; w: number; h: number }[] = a.pinbox
    .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }))
    .concat(a.keepOut);

  const measure = (txt: string) => {
    cx.save();
    cx.font = CTY_FONT;
    const w = cx.measureText(txt).width + CTY_TRACKING * txt.length + 6;
    cx.restore();
    return w;
  };

  const place = (c: [number, number], name: string) => {
    const w = measure(name);
    if (globe && geoDistance(c, ctr) > 1.24) return;
    const xy = pr(c);
    if (!xy || isNaN(xy[0])) return;
    const [x, y] = xy;
    if (x - w / 2 < 8 || x + w / 2 > W - 8 || y < 16 || y > H - 16) return;
    if (
      boxes.some(
        (b) => Math.abs(b.x - x) < (b.w + w) / 2 + 4 && Math.abs(b.y - y) < (b.h + 14) / 2 + 4,
      )
    )
      return;
    boxes.push({ x, y, w, h: 14 });
    const el = document.createElement('div');
    el.className = 'lbl lbl-cty';
    el.style.cssText += 'left:' + x + 'px;top:' + y + 'px;color:' + p.lblCty;
    el.textContent = name;
    ov.appendChild(el);
  };

  a.cty.forEach((d) => {
    if (k >= d.minK) place(d.c, d.name);
  });
}
