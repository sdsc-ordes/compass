/**
 * The SVG basemap: land, country borders, graticule, the globe's rim and shading.
 *
 * The prototype fetched Natural Earth from a CDN; the widget is one self-contained
 * file, so the topology is committed (scripts/build-atlas.mjs, `just atlas`) and
 * imported. The prototype's optional sea-label file has no home here.
 */
import { geoPath, geoGraticule10, geoCentroid, geoArea } from 'd3-geo';
import type { GeoProjection, GeoPermissibleObjects } from 'd3-geo';
import { feature, merge, mesh } from 'topojson-client';
import type {
  GeometryCollection,
  MultiPolygon,
  Polygon,
  Topology,
} from 'topojson-specification';
import atlasJson from '../atlas.json';
import { P, type Theme } from './palette';
import { proj, type ViewState } from './projection';
import { CTY_MIN, type CountryLabel } from './labels';

/** Every geometry the renderer draws, built once at boot. */
export interface Atlas {
  land: GeoPermissibleObjects;
  borders: GeoPermissibleObjects;
  grat: GeoPermissibleObjects;
  cty: CountryLabel[];
}

/** The SVG nodes renderBasemap writes into — created as markup by Stage.svelte. */
export interface BasemapRefs {
  svg: SVGSVGElement;
  world: SVGGElement;
  page: SVGRectElement;
  sea: SVGPathElement;
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

/** Builds the atlas geometry. Synchronous — the topology is already in the bundle. */
export function loadAtlas(): Atlas {
  if (cached) return cached;
  const topo = atlasJson as unknown as Topology<{
    countries: GeometryCollection<{ name: string }>;
  }>;
  const countries = topo.objects.countries;
  const min = new Map(CTY_MIN);
  cached = {
    /* The members, not the collection: merge() calls .forEach on what it is given,
       so the collection its types also advertise would throw. */
    land: merge(
      topo,
      countries.geometries as Array<Polygon | MultiPolygon>,
    ) as GeoPermissibleObjects,
    borders: mesh(topo, countries, (a, b) => a !== b) as GeoPermissibleObjects,
    grat: geoGraticule10() as GeoPermissibleObjects,
    cty: feature(topo, countries)
      .features.filter((f) => f.properties && min.has(f.properties.name))
      .map((f) => ({
        name: f.properties.name,
        minK: min.get(f.properties.name) as number,
        c: geoCentroid(f as GeoPermissibleObjects) as [number, number],
        area: geoArea(f as GeoPermissibleObjects),
      }))
      .sort((a, b) => b.area - a.area),
  };
  return cached;
}

/** Repaints the basemap for the current view, with setAttribute rather than
    d3-selection — not worth a second library for four calls. */
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
  const pr: GeoProjection = proj(S, W, H);
  const path = geoPath(pr);
  const landD = path(atlas.land);

  set(bm.page, { width: W, height: H, fill: p.page });
  set(bm.sea, { d: path({ type: 'Sphere' }) ?? '', fill: p.sea });
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
    bm.sh2.setAttribute(
      'stop-color',
      S.theme === 'light' ? 'rgba(20,46,73,.26)' : 'rgba(2,10,18,.5)',
    );
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
