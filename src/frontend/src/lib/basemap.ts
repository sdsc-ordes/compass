import { geoPath, geoGraticule10 } from 'd3-geo';
import type { GeoProjection, GeoPermissibleObjects } from 'd3-geo';
import { merge, mesh } from 'topojson-client';
import type {
  GeometryCollection,
  MultiPolygon,
  Polygon,
  Topology,
} from 'topojson-specification';
import atlasJson from '../atlas.json';
import labelsJson from '../atlas-labels.json';
import { P, type Theme } from './palette';
import { proj, type ViewState } from './projection';
import type { MapLabel, SeaLabel } from './labels';

export interface Atlas {
  land: GeoPermissibleObjects;
  borders: GeoPermissibleObjects;
  grat: GeoPermissibleObjects;
  cty: MapLabel[];
  sea: SeaLabel[];
}

export interface BasemapRefs {
  svg: SVGSVGElement;
  world: SVGGElement;
  grat: SVGPathElement;
  land: SVGPathElement;
  borders: SVGPathElement;
  rim: SVGPathElement;
  shade: SVGPathElement;
  globeClipPath: SVGPathElement;
  sh0: SVGStopElement;
  sh1: SVGStopElement;
  sh2: SVGStopElement;
}

let cached: Atlas | null = null;

export function loadAtlas(): Atlas {
  if (cached) return cached;
  const topo = atlasJson as unknown as Topology<{
    countries: GeometryCollection<{ name: string }>;
  }>;
  const countries = topo.objects.countries;
  const table = labelsJson as { cty: MapLabel[]; sea: SeaLabel[] };
  cached = {
    land: merge(
      topo,
      countries.geometries as Array<Polygon | MultiPolygon>,
    ) as GeoPermissibleObjects,
    borders: mesh(topo, countries, (a, b) => a !== b) as GeoPermissibleObjects,
    grat: geoGraticule10() as GeoPermissibleObjects,
    cty: table.cty,
    sea: table.sea,
  };
  return cached;
}

/* Re-projecting Natural Earth is the expensive half of a frame, and a gesture
   does not need it: zooming or panning the flat map, or zooming the globe at a
   rest rotation, moves every projected point by the same translate-and-scale.
   So mid-gesture the world group is nudged by that transform and the paths are
   left alone; the real projection is rebuilt once the hands come off. Only a
   rotation is genuinely non-affine. */
interface Anchor {
  view: 'flat' | 'globe';
  theme: Theme;
  rot: [number, number];
  k: number;
  tx: number;
  ty: number;
  w: number;
  h: number;
}

let anchor: Anchor | null = null;

export function nudgeBasemap(bm: BasemapRefs, S: ViewState, W: number, H: number): boolean {
  if (!anchor || anchor.view !== S.view || anchor.w !== W || anchor.h !== H) return false;
  // a nudge moves the paths, it cannot recolour them
  if (anchor.theme !== S.theme) return false;
  if (S.view === 'globe' && (anchor.rot[0] !== S.rot[0] || anchor.rot[1] !== S.rot[1]))
    return false;
  const g = S.k / anchor.k;
  const dx = S.view === 'flat' ? S.tx - g * anchor.tx : (W / 2) * (1 - g);
  const dy = S.view === 'flat' ? S.ty - g * anchor.ty : (H / 2) * (1 - g);
  bm.world.setAttribute('transform', `translate(${dx} ${dy}) scale(${g})`);
  return true;
}

export function renderBasemap(
  bm: BasemapRefs,
  S: ViewState,
  W: number,
  H: number,
  atlas: Atlas,
): void {
  const p = P[S.theme as Theme],
    k = S.k;
  bm.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  bm.world.removeAttribute('transform');
  anchor = {
    view: S.view,
    theme: S.theme,
    rot: [S.rot[0], S.rot[1]],
    k,
    tx: S.tx,
    ty: S.ty,
    w: W,
    h: H,
  };
  const pr: GeoProjection = proj(S, W, H);
  const path = geoPath(pr);
  const landD = path(atlas.land);

  set(bm.grat, {
    d: path(atlas.grat) ?? '',
    stroke: p.grat,
    'stroke-width': 0.6,
    fill: 'none',
  });

  set(bm.land, {
    d: landD ?? '',
    fill: p.land,
    stroke: p.coast,
    'stroke-width': Math.min(1.2, 0.6 + k * 0.05),
  });
  if (atlas.borders) {
    set(bm.borders, {
      d: path(atlas.borders) ?? '',
      stroke: p.ctyLine,
      'stroke-width': 0.75,
      'stroke-linejoin': 'round',
      fill: 'none',
    });
  } else {
    bm.borders.removeAttribute('d');
  }

  if (S.view === 'globe') {
    const sphereD = path({ type: 'Sphere' }) ?? '';
    bm.globeClipPath.setAttribute('d', sphereD);
    bm.sh0.setAttribute('stop-color', 'rgba(255,255,255,0)');
    bm.sh1.setAttribute('stop-color', 'rgba(8,26,44,0)');
    bm.sh2.setAttribute('stop-color', p.shade);
    bm.shade.setAttribute('d', sphereD);
    bm.shade.style.display = '';
    set(bm.rim, { d: sphereD, stroke: p.rim, 'stroke-width': 1, fill: 'none' });
    bm.rim.style.display = '';
  } else {
    bm.shade.style.display = 'none';
    bm.rim.style.display = 'none';
  }
}

function set(el: Element, attrs: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
}
