export interface Tag {
  iri: string;
  label: string;
}

export interface Entry {
  id: string;
  lonLat: [number, number];
  title: string;
  // Unabbreviated name when `title` is an acronym; empty where the workbook
  // leaves skos:altLabel blank.
  longName: string;
  where: string;
  description: string;
  typeLabel: string;
  typeIri: string;
  tags: Record<string, Tag[]>;
  storiesUrl: string;
  url: string;
}

export interface Cluster {
  id: string;
  cluster: Entry[];
  lonLat: [number, number];
  title: string;
  where: string;
}

export type PinTarget = Entry | Cluster;

export const isCluster = (p: PinTarget): p is Cluster => 'cluster' in p;

/** Join the distinct entity type names of a pin or cluster. */
export function entityLabel(p: PinTarget): string {
  const names = isCluster(p) ? [...new Set(p.cluster.map((d) => d.typeLabel))] : [p.typeLabel];
  return names.filter(Boolean).join(' · ');
}

// A drawn pin's screen box, centred on its head, in paint order.
export interface PinBox {
  x: number;
  y: number;
  w: number;
  h: number;
  headR: number;
  tipY: number;
  target: PinTarget;
  // Hit-test radius around (x, y).
  hitR: number;
}
