export interface Tag {
  iri: string;
  label: string;
}

export interface Proj {
  id: string;
  c: [number, number];
  title: string;
  // The unabbreviated name, where the display name is an acronym. Empty for
  // the entities whose workbook row leaves skos:altLabel blank.
  longName: string;
  where: string;
  txt: string;
  entity: string;
  typeIri: string;
  tags: Record<string, Tag[]>;
  storiesUrl: string;
  url: string;
}

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

export function entityLabel(p: PinTarget): string {
  const keys = isCluster(p) ? [...new Set(p.cluster.map((d) => d.entity))] : [p.entity];
  return keys.filter(Boolean).join(' · ');
}

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
