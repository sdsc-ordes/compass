/** What the stage and the sidebar agree a pin is. */

/** A tag as the engine hands it over: full IRI plus its localized label. */
export interface Tag {
  iri: string;
  label: string;
}

/** One entity, flattened for the stage. `id` is the subject IRI and the key
    everywhere. */
export interface Proj {
  id: string;
  /** [lng, lat], straight off feature.geometry.coordinates. */
  c: [number, number];
  title: string;
  where: string;
  txt: string;
  /** properties.type — already the localized type label, so never a key lookup. */
  entity: string;
  /** properties.typeIri — the type's own IRI, which is what the detail pane's type
      pill hands to the entityType filter. '' when the feature carried none. */
  typeIri: string;
  /** dimension id -> that dimension's tags, what .ptags render and filterByTag toggles. */
  tags: Record<string, Tag[]>;
  /** WordPress tag ids behind the "Read more" link; '' when the entity has none. */
  /** The entity's filtered stories index on oceancare.org, or '' when it has no
      tag id. Built by the API from the requested language, so the widget neither
      knows the base URL nor picks between languages. */
  storiesUrl: string;
  /** schema:url — the entity's own website; '' when it has none. */
  url: string;
}

/** Several pins that would collide at this scale, drawn once as a counted disc. */
export interface Cluster {
  id: string;
  cluster: Proj[];
  c: [number, number];
  title: string;
  where: string;
  txt: string;
}

export type PinTarget = Proj | Cluster;

export const isCluster = (p: PinTarget): p is Cluster => 'cluster' in p;

/**
 * The type in words. Pins are all one colour by design, so nothing on the map is
 * told apart by hue and this is the only place the type is stated. A cluster's
 * types are deduped.
 */
export function entityLabel(p: PinTarget): string {
  const keys = isCluster(p) ? [...new Set(p.cluster.map((d) => d.entity))] : [p.entity];
  return keys.filter(Boolean).join(' · ');
}

/** A hit box registered by drawPins, in stage pixels. */
export interface PinBox {
  x: number;
  y: number;
  w: number;
  h: number;
  headR: number;
  tipY: number;
  p: PinTarget;
  r: number;
}
