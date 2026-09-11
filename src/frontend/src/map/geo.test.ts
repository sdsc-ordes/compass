import { describe, expect, it } from 'vitest';
import {
  buildConnectionIndex,
  connectionLines,
  extendBounds,
  graticule,
  linkedIrisOf,
  parseFeatureProps,
  splitFeatures,
  typeColorExpression,
} from './geo';
import type { Feature } from '../engine';

const pin = (id: string, coordinates: [number, number], props = {}): Feature =>
  ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: { id, label: id, type: 'Project', typeIri: 'x', storiesUrl: '', ...props },
  }) as Feature;

const region = (regionKey: string, props = {}): Feature =>
  ({
    type: 'Feature',
    geometry: null,
    properties: {
      id: `iri:${regionKey}`,
      label: regionKey,
      type: 'CountryArea',
      typeIri: 'x',
      storiesUrl: '',
      is_region: true,
      regionKey,
      ...props,
    },
  }) as Feature;

const POLYGON = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
};

describe('parseFeatureProps', () => {
  it('parses a JSON array back into objects', () => {
    const parsed = parseFeatureProps({ topic: '[{"iri":"a","label":"A"}]' });
    expect(parsed.topic).toEqual([{ iri: 'a', label: 'A' }]);
  });

  it('leaves a plain string alone', () => {
    expect(parseFeatureProps({ label: 'Baltic Sea' }).label).toBe('Baltic Sea');
  });

  it('leaves a non-string value alone', () => {
    expect(parseFeatureProps({ is_region: true }).is_region).toBe(true);
  });

  it('does not mangle a label that merely starts with a bracket', () => {
    expect(parseFeatureProps({ label: '[draft] Whales' }).label).toBe('[draft] Whales');
  });

  it('does not turn a JSON object into data', () => {
    expect(parseFeatureProps({ label: '{"a":1}' }).label).toBe('{"a":1}');
  });
});

describe('linkedIrisOf', () => {
  it('reads objects straight from the API', () => {
    expect(
      linkedIrisOf([
        { iri: 'a', label: 'A' },
        { iri: 'b', label: 'B' },
      ]),
    ).toEqual(['a', 'b']);
  });

  it('reads the JSON string MapLibre hands back', () => {
    expect(linkedIrisOf('[{"iri":"a"}]')).toEqual(['a']);
  });

  it('accepts a bare string list', () => {
    expect(linkedIrisOf(['a', 'b'])).toEqual(['a', 'b']);
  });

  it.each([undefined, null, '', 'nonsense', '[', 42, {}])('returns [] for %p', (input) => {
    expect(linkedIrisOf(input)).toEqual([]);
  });

  it('drops entries with no iri', () => {
    expect(linkedIrisOf([{ label: 'A' }, { iri: 'b' }])).toEqual(['b']);
  });
});

describe('splitFeatures', () => {
  it('separates pins from regions and joins the boundary', () => {
    const result = splitFeatures([pin('a', [1, 2]), region('Baltic')], {
      Baltic: POLYGON as never,
    });
    expect(result.points).toHaveLength(1);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].geometry).toBe(POLYGON);
    expect(result.unmatchedRegions).toEqual([]);
  });

  it('reports a region with no polygon instead of emitting it', () => {
    const result = splitFeatures([region('Atlantis')], {});
    expect(result.regions).toEqual([]);
    expect(result.unmatchedRegions).toEqual(['Atlantis']);
  });

  it('does not mutate the input feature', () => {
    const input = region('Baltic');
    splitFeatures([input], { Baltic: POLYGON as never });
    expect(input.geometry).toBeNull();
  });
});

describe('buildConnectionIndex', () => {
  it('links both ends from a one-sided declaration', () => {
    const index = buildConnectionIndex([
      pin('a', [0, 0], { relatedProject: [{ iri: 'b', label: 'B' }] }),
      pin('b', [1, 1]),
    ]);
    expect([...index.neighboursByIri.get('a')!]).toEqual(['b']);
    expect([...index.neighboursByIri.get('b')!]).toEqual(['a']);
  });

  it('ignores a link to something with no coordinates', () => {
    const index = buildConnectionIndex([
      pin('a', [0, 0], { relatedProject: [{ iri: 'ghost' }] }),
    ]);
    expect(index.neighboursByIri.has('a')).toBe(false);
  });

  it('ignores a self-link', () => {
    const index = buildConnectionIndex([pin('a', [0, 0], { relatedProject: [{ iri: 'a' }] })]);
    expect(index.neighboursByIri.has('a')).toBe(false);
  });

  it('skips regions, which have links but no geometry', () => {
    const index = buildConnectionIndex([region('Baltic', { relatedProject: [{ iri: 'a' }] })]);
    expect(index.coordByIri.size).toBe(0);
    expect(index.neighboursByIri.size).toBe(0);
  });

  it('merges relatedProject and relatedOrganization', () => {
    const index = buildConnectionIndex([
      pin('a', [0, 0], {
        relatedProject: [{ iri: 'b' }],
        relatedOrganization: [{ iri: 'c' }],
      }),
      pin('b', [1, 1]),
      pin('c', [2, 2]),
    ]);
    expect([...index.neighboursByIri.get('a')!].sort()).toEqual(['b', 'c']);
  });
});

describe('connectionLines', () => {
  const index = buildConnectionIndex([
    pin('a', [0, 0], { relatedProject: [{ iri: 'b' }] }),
    pin('b', [1, 1]),
  ]);

  it('draws one line per neighbour, from the source', () => {
    const { features, endpointIris } = connectionLines('a', index);
    expect(endpointIris).toEqual(['b']);
    expect(features[0].geometry.coordinates).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  it('returns nothing for an unknown iri', () => {
    expect(connectionLines('missing', index)).toEqual({ features: [], endpointIris: [] });
  });

  it('returns nothing for a pin with no neighbours', () => {
    const lonely = buildConnectionIndex([pin('a', [0, 0])]);
    expect(connectionLines('a', lonely).features).toEqual([]);
  });
});

describe('extendBounds', () => {
  const collect = () => {
    const seen: [number, number][] = [];
    return { bounds: { extend: (c: [number, number]) => seen.push(c) }, seen };
  };

  it('walks a Polygon to its coordinate pairs', () => {
    const { bounds, seen } = collect();
    extendBounds(bounds, POLYGON as never);
    expect(seen).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ]);
  });

  it('walks a MultiPolygon', () => {
    const { bounds, seen } = collect();
    extendBounds(bounds, {
      type: 'MultiPolygon',
      coordinates: [POLYGON.coordinates],
    } as never);
    expect(seen).toHaveLength(4);
  });

  it('tolerates a null geometry', () => {
    const { bounds, seen } = collect();
    extendBounds(bounds, null);
    expect(seen).toEqual([]);
  });
});

describe('graticule', () => {
  it('spans the globe at the requested step', () => {
    const grid = graticule(20);
    // 19 meridians (-180..180) plus 9 parallels (-80..80).
    expect(grid.features).toHaveLength(28);
  });

  it('keeps every coordinate in range', () => {
    for (const line of graticule(20).features) {
      for (const [lon, lat] of line.geometry.coordinates) {
        expect(Math.abs(lon)).toBeLessThanOrEqual(180);
        expect(Math.abs(lat)).toBeLessThanOrEqual(80);
      }
    }
  });
});

describe('typeColorExpression', () => {
  it('builds a match expression ending in the fallback', () => {
    expect(typeColorExpression({ a: '#111', b: '#222' }, '#999')).toEqual([
      'match',
      ['get', 'typeIri'],
      'a',
      '#111',
      'b',
      '#222',
      '#999',
    ]);
  });

  it('is just the fallback when nothing is mapped', () => {
    expect(typeColorExpression({}, '#999')).toEqual(['match', ['get', 'typeIri'], '#999']);
  });
});
