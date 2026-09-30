import type { Feature } from '../engine';
import { DIM_IDS } from './schema';
import type { Entry, Tag } from './types';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function toEntry(f: Feature): Entry | null {
  const p = f.properties;
  if (!p || !f.geometry) return null;
  const lonLat = f.geometry.coordinates as number[];
  if (!Array.isArray(lonLat) || !isFinite(lonLat[0]) || !isFinite(lonLat[1])) return null;
  return {
    id: p.id,
    lonLat: [Number(lonLat[0]), Number(lonLat[1])],
    title: p.label ?? '',
    longName: text(p.altLabel),
    where: text(p.location),
    description: text(p.description),
    typeLabel: p.type ?? '',
    typeIri: p.typeIri ?? '',
    tags: Object.fromEntries(
      DIM_IDS.map((id) => [id, (Array.isArray(p[id]) ? p[id] : []) as Tag[]]),
    ),
    storiesUrl: text(p.storiesUrl),
    url: text(p.url),
  };
}

/** Map API features to pins, dropping any without a point geometry. */
export const toEntries = (features: Feature[]): Entry[] =>
  features.map(toEntry).filter((p): p is Entry => p !== null);
