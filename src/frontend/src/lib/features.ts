/**
 * The engine's GeoJSON features, flattened into the pins the UI works with.
 *
 * The whole data-layer boundary in the UI's direction: what src/engine hands over
 * is shaped per spec id at runtime, and everything past here is typed as Proj.
 */
import type { Feature } from '../engine';
import { DIM_IDS } from './schema';
import type { Proj, Tag } from './types';

/**
 * One property of the API's feature, as text.
 *
 * Only `id`, `label`, `type` and `typeIri` are declared on EntityProperties;
 * everything else the shapes put on a feature is typed `unknown`, because the
 * ontology decides what is there. Absent, null and a number all become '', so a
 * missing cell renders as nothing rather than as "undefined".
 */
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export function toProj(f: Feature): Proj | null {
  const p = f.properties;
  if (!p) return null;
  /* Country/Area entities arrive with geometry:null and is_region:true. They have
     no coordinates and the design draws no region layer, so they are not pins —
     a region reaches the UI only as a tag. */
  if (!f.geometry || p.is_region) return null;
  const c = f.geometry.coordinates as number[];
  if (!Array.isArray(c) || !isFinite(c[0]) || !isFinite(c[1])) return null;
  return {
    id: p.id,
    c: [Number(c[0]), Number(c[1])],
    title: p.label ?? '',
    where: text(p.location),
    txt: text(p.description),
    /* Already the localized type label, so there is no key -> label map here. */
    entity: p.type ?? '',
    /* The label is for reading, the IRI is what the entityType filter matches on. */
    typeIri: p.typeIri ?? '',
    tags: Object.fromEntries(
      DIM_IDS.map((id) => [id, (Array.isArray(p[id]) ? p[id] : []) as Tag[]]),
    ),
    storiesUrl: text(p.storiesUrl),
    url: text(p.url),
  };
}

/** Every pin the filters leave standing, regions dropped. */
export const toProjs = (features: Feature[]): Proj[] =>
  features.map(toProj).filter((p): p is Proj => p !== null);
