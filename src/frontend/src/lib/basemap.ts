import { geoPath, geoGraticule10 } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import { merge, mesh } from 'topojson-client';
import type {
  GeometryCollection,
  MultiPolygon,
  Polygon,
  Topology,
} from 'topojson-specification';
import { writable } from 'svelte/store';
import labelsJson from '../atlas-labels.json';
import { PALETTES } from './palette';
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

// Fetched from tileurl rather than bundled: the topology outweighs the rest of the widget.
const ATLAS = `basemap/atlas.json?v=${__ASSET_V__}`;

export const atlas = writable<Atlas | null>(null);

let request: Promise<Atlas> | null = null;

/** Fetch and build the atlas once; a failed load is retried on the next call. */
export function loadAtlas(base: string): Promise<Atlas> {
  request ??= fetch(`${base}/${ATLAS}`)
    .then((res) => {
      if (!res.ok) throw new Error(`basemap HTTP ${res.status}`);
      return res.json();
    })
    .then((json) => {
      const built = build(json);
      atlas.set(built);
      return built;
    })
    .catch((e) => {
      request = null;
      throw e;
    });
  return request;
}

function build(json: unknown): Atlas {
  const topo = json as Topology<{
    countries: GeometryCollection<{ name: string }>;
  }>;
  const countries = topo.objects.countries;
  const labels = labelsJson as { cty: MapLabel[]; sea: SeaLabel[] };
  return {
    land: merge(
      topo,
      countries.geometries as Array<Polygon | MultiPolygon>,
    ) as GeoPermissibleObjects,
    borders: mesh(topo, countries, (a, b) => a !== b) as GeoPermissibleObjects,
    grat: geoGraticule10() as GeoPermissibleObjects,
    cty: labels.cty,
    sea: labels.sea,
  };
}

// The view the paths were last projected for. Flat pan and zoom, and globe
// zoom, move every projected point by one translate and scale, so mid-gesture
// nudgeBasemap transforms the group instead of re-projecting. Rotation cannot.
type Anchor = Pick<ViewState, 'view' | 'theme' | 'rot' | 'k' | 'tx' | 'ty'> & {
  w: number;
  h: number;
};

let anchor: Anchor | null = null;

/** Move the last projected paths to the current view; false when only a re-render can. */
export function nudgeBasemap(bm: BasemapRefs, S: ViewState, W: number, H: number): boolean {
  if (!anchor || anchor.view !== S.view || anchor.w !== W || anchor.h !== H) return false;
  if (anchor.theme !== S.theme) return false; // a transform cannot recolour
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
  data: Atlas,
): void {
  const p = PALETTES[S.theme];
  bm.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  bm.world.removeAttribute('transform');
  anchor = {
    view: S.view,
    theme: S.theme,
    rot: [S.rot[0], S.rot[1]],
    k: S.k,
    tx: S.tx,
    ty: S.ty,
    w: W,
    h: H,
  };
  const path = geoPath(proj(S, W, H));

  setAttrs(bm.grat, {
    d: path(data.grat) ?? '',
    stroke: p.grat,
    'stroke-width': 0.6,
    fill: 'none',
  });
  setAttrs(bm.land, {
    d: path(data.land) ?? '',
    fill: p.land,
    stroke: p.coast,
    'stroke-width': Math.min(1.2, 0.6 + S.k * 0.05),
  });
  setAttrs(bm.borders, {
    d: path(data.borders) ?? '',
    stroke: p.ctyLine,
    'stroke-width': 0.75,
    'stroke-linejoin': 'round',
    fill: 'none',
  });

  if (S.view === 'globe') {
    const sphereD = path({ type: 'Sphere' }) ?? '';
    bm.globeClipPath.setAttribute('d', sphereD);
    bm.sh0.setAttribute('stop-color', 'rgba(255,255,255,0)');
    bm.sh1.setAttribute('stop-color', p.shadeFade);
    bm.sh2.setAttribute('stop-color', p.shade);
    bm.shade.setAttribute('d', sphereD);
    bm.shade.style.display = '';
    setAttrs(bm.rim, { d: sphereD, stroke: p.rim, 'stroke-width': 1, fill: 'none' });
    bm.rim.style.display = '';
  } else {
    bm.shade.style.display = 'none';
    bm.rim.style.display = 'none';
  }
}

function setAttrs(el: Element, attrs: Record<string, string | number>): void {
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
}
