/** SPARQL rows -> GeoJSON FeatureCollection. */
import { ITEM_SEP, FIELD_SEP, type Spec } from './namespaces';
import type { Row } from './oxigraph';

export interface Feature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] } | null;
  properties: Record<string, any>;
}
export interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

function localName(iri: string): string {
  return iri.includes('#') ? iri.split('#').pop()! : iri.split('/').pop()!;
}

function extractProperty(spec: Spec, res: Row): any {
  const sid = spec.id;
  const cat = spec.category;
  const isMulti = spec.is_multi;

  if (cat === 'iri_with_label') {
    if (isMulti) {
      const raw = res[`${sid}Raw`] ?? '';
      const items: Array<{ iri: string; label: string }> = [];
      for (const pair of raw.split(ITEM_SEP)) {
        const idx = pair.trim().indexOf(FIELD_SEP);
        if (idx === -1) continue;
        const iri = pair.trim().slice(0, idx);
        const label = pair.trim().slice(idx + FIELD_SEP.length);
        if (iri) items.push({ iri: iri.trim(), label: label.trim() });
      }
      return items;
    }
    const iriVal = res[`${sid}Iri`];
    const labelVal = res[`${sid}Label`];
    if (!iriVal) return null;
    const label = labelVal ? String(labelVal) : localName(String(iriVal));
    return { iri: String(iriVal), label };
  }

  if (cat === 'boolean') {
    return res[`${sid}Result`] === 'true';
  }

  if (isMulti) {
    const raw = res[`${sid}Raw`] ?? '';
    return raw
      .split(ITEM_SEP)
      .map((a) => a.trim())
      .filter((a) => a);
  }

  return res[`${sid}Result`] ?? '';
}

function parseSpecialProperties(res: Row): Record<string, string> {
  return {
    startDate: res['selfStart'] ?? '',
    endDate: res['selfEnd'] ?? '',
    wpEntityTagIdEn: res['wpEntityTagIdEn'] ?? '',
    wpEntityTagIdDe: res['wpEntityTagIdDe'] ?? '',
  };
}

/** Convert flattened SPARQL rows into a GeoJSON FeatureCollection. */
export function resultsToGeojson(results: Row[], specs: Spec[]): FeatureCollection {
  const features: Feature[] = [];
  for (const res of results) {
    try {
      if (res['s'] === undefined || res['label'] === undefined || res['type'] === undefined) {
        continue;
      }
      const properties: Record<string, any> = {
        id: res['s'],
        label: res['label'],
        type: String(res['typeLabelResult'] || localName(res['type'])),
        typeIri: res['type'],
      };

      for (const spec of specs) {
        properties[spec.id] = extractProperty(spec, res);
      }

      Object.assign(properties, parseSpecialProperties(res));

      const latRaw = res['lat'];
      const longRaw = res['long'];
      if (!latRaw || !longRaw) {
        properties.is_region = true;
        properties.regionKey = localName(res['s']);
        features.push({ type: 'Feature', geometry: null, properties });
        continue;
      }

      const lat = parseFloat(latRaw);
      const lng = parseFloat(longRaw);
      if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties,
      });
    } catch {
      continue;
    }
  }

  return { type: 'FeatureCollection', features };
}
