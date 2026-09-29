import type { Feature } from '../engine';
import { DIM_IDS } from './schema';
import type { Proj, Tag } from './types';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export function toProj(f: Feature): Proj | null {
  const p = f.properties;
  if (!p) return null;
  if (!f.geometry) return null;
  const c = f.geometry.coordinates as number[];
  if (!Array.isArray(c) || !isFinite(c[0]) || !isFinite(c[1])) return null;
  return {
    id: p.id,
    c: [Number(c[0]), Number(c[1])],
    title: p.label ?? '',
    longName: text(p.altLabel),
    where: text(p.location),
    txt: text(p.description),
    entity: p.type ?? '',
    typeIri: p.typeIri ?? '',
    tags: Object.fromEntries(
      DIM_IDS.map((id) => [id, (Array.isArray(p[id]) ? p[id] : []) as Tag[]]),
    ),
    storiesUrl: text(p.storiesUrl),
    url: text(p.url),
  };
}

export const toProjs = (features: Feature[]): Proj[] =>
  features.map(toProj).filter((p): p is Proj => p !== null);
