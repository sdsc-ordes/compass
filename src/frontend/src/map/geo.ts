/**
 * The map's pure geometry and graph logic, kept out of the component so it can
 * be tested without a MapLibre instance or a DOM.
 */
import type { EntityProperties, Feature, Geometry } from '../engine';

/** Anything that accumulates a bounding box; MapLibre's LngLatBounds fits. */
export type BoundsLike = { extend(coordinate: [number, number]): unknown };

/** A feature whose geometry is known to be a Point. */
export type PointFeature = Feature & { geometry: { type: 'Point'; coordinates: number[] } };

/**
 * MapLibre flattens feature properties to scalars, so a tag array read back off
 * the rendered map arrives as a JSON string. Parse those back, and leave every
 * other value alone: only a string that both looks like an array and parses as
 * one is converted, so a label is never mangled into data.
 */
export function parseFeatureProps(props: Record<string, unknown>): EntityProperties {
  const parsed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    parsed[key] = typeof value === 'string' ? maybeArray(value) : value;
  }
  return parsed as EntityProperties;
}

function maybeArray(value: string): unknown {
  if (!value.startsWith('[')) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    return value;
  }
}

/** Meridians and parallels every *step* degrees, so open ocean is not featureless. */
export function graticule(step = 20) {
  const lines = [];
  for (let lon = -180; lon <= 180; lon += step) {
    const points = [];
    for (let lat = -80; lat <= 80; lat += 5) points.push([lon, lat]);
    lines.push(lineString(points));
  }
  for (let lat = -80; lat <= 80; lat += step) {
    const points = [];
    for (let lon = -180; lon <= 180; lon += 5) points.push([lon, lat]);
    lines.push(lineString(points));
  }
  return { type: 'FeatureCollection' as const, features: lines };
}

const lineString = (coordinates: number[][]) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'LineString' as const, coordinates },
});

/** Extend *bounds* by every coordinate in a geometry, at any nesting depth. */
export function extendBounds(bounds: BoundsLike, geometry: Geometry | null): void {
  if (!geometry?.coordinates) return;
  const walk = (part: unknown) => {
    if (!Array.isArray(part)) return;
    if (typeof part[0] === 'number') bounds.extend(part as [number, number]);
    else part.forEach(walk);
  };
  walk(geometry.coordinates);
}

export type SplitFeatures = {
  /** Pins, which cluster. */
  points: PointFeature[];
  /** Country/Area features with their boundary polygon joined on. */
  regions: Feature[];
  /** regionKeys the bundled boundary file has no polygon for. */
  unmatchedRegions: string[];
};

/**
 * Separate pins from regions, joining each region's boundary polygon by key.
 *
 * Regions arrive without geometry -- a Country/Area concept has no coordinates
 * of its own -- so their shape comes from the bundled Natural Earth extract.
 * The two also cannot share a source: a clustered source drops polygons.
 */
export function splitFeatures(
  entities: Feature[],
  regionGeometry: Record<string, Geometry>,
): SplitFeatures {
  const points: PointFeature[] = [];
  const regions: Feature[] = [];
  const unmatchedRegions: string[] = [];

  for (const feature of entities) {
    if (feature.geometry?.type === 'Point') {
      points.push(feature as PointFeature);
      continue;
    }
    if (!feature.properties?.is_region) continue;
    const key = feature.properties.regionKey;
    const geometry = key ? regionGeometry[key] : undefined;
    if (!geometry) {
      unmatchedRegions.push(key ?? '(no regionKey)');
      continue;
    }
    regions.push({ ...feature, geometry });
  }
  return { points, regions, unmatchedRegions };
}

/**
 * The IRIs a link property points at.
 *
 * The property is [{iri, label}] on a feature straight from the API and a JSON
 * string on one read back off the rendered map, so both are accepted.
 */
export function linkedIrisOf(raw: unknown): string[] {
  const list = typeof raw === 'string' ? maybeArray(raw) : raw;
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => (typeof entry === 'string' ? entry : (entry as { iri?: string })?.iri))
    .filter((iri): iri is string => Boolean(iri));
}

export type ConnectionIndex = {
  coordByIri: Map<string, [number, number]>;
  /** Symmetric, so a link declared on either side draws from both ends. */
  neighboursByIri: Map<string, Set<string>>;
};

/** Index the org/project links between pins. Both ends need coordinates. */
export function buildConnectionIndex(entities: Feature[]): ConnectionIndex {
  const coordByIri = new Map<string, [number, number]>();
  const neighboursByIri = new Map<string, Set<string>>();

  for (const feature of entities) {
    const iri = feature.properties?.id;
    const coordinates = feature.geometry?.coordinates;
    if (!iri || !Array.isArray(coordinates) || typeof coordinates[0] !== 'number') continue;
    coordByIri.set(iri, [coordinates[0] as number, coordinates[1] as number]);
  }

  const connect = (from: string, to: string) => {
    const neighbours = neighboursByIri.get(from) ?? new Set<string>();
    neighbours.add(to);
    neighboursByIri.set(from, neighbours);
  };

  // Regions carry links but no geometry, so they drop out here.
  for (const feature of entities) {
    const iri = feature.properties?.id;
    if (!iri || !coordByIri.has(iri)) continue;
    const linked = [
      ...linkedIrisOf(feature.properties.relatedProject),
      ...linkedIrisOf(feature.properties.relatedOrganization),
    ];
    for (const other of linked) {
      if (other === iri || !coordByIri.has(other)) continue;
      connect(iri, other);
      connect(other, iri);
    }
  }
  return { coordByIri, neighboursByIri };
}

/** One dashed LineString from *iri* to each of its neighbours. */
export function connectionLines(iri: string, index: ConnectionIndex) {
  const origin = index.coordByIri.get(iri);
  if (!origin) return { features: [], endpointIris: [] as string[] };

  const endpointIris = [...(index.neighboursByIri.get(iri) ?? [])].filter((other) =>
    index.coordByIri.has(other),
  );
  return {
    endpointIris,
    features: endpointIris.map((other) => lineString([origin, index.coordByIri.get(other)!])),
  };
}

/** A MapLibre `match` expression mapping each type IRI to its pin colour. */
export function typeColorExpression(colors: Record<string, string>, fallback: string) {
  const expression: unknown[] = ['match', ['get', 'typeIri']];
  for (const [iri, color] of Object.entries(colors)) expression.push(iri, color);
  expression.push(fallback);
  return expression;
}
