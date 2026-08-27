/** Namespace URIs and SPARQL prefix declarations. */

export const COMPASS = 'http://example.org/ocean-org/ontology#';
export const GEO = 'http://www.w3.org/2003/01/geo/wgs84_pos#';
export const SCHEMA = 'https://schema.org/';

// Separators used by SPARQL GROUP_CONCAT expressions and resultParser
export const ITEM_SEP = ';;'; // between multi-valued items
export const FIELD_SEP = '|'; // between fields within a single item

// Maps full namespace URIs to their SPARQL shorthand prefix (used by toPrefixed())
export const PREFIX_MAP: Record<string, string> = {
  'http://example.org/ocean-org/ontology#': 'compass:',
  'http://www.w3.org/2003/01/geo/wgs84_pos#': 'geo:',
  'https://schema.org/': 'schema:',
};

export const SPARQL_PREFIXES = `
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
    PREFIX compass: <http://example.org/ocean-org/ontology#>
    PREFIX schema: <https://schema.org/>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    `;

/** A property spec, as emitted by backend get_property_specs() into specs.json. */
export interface Spec {
  id: string;
  path_iri: string;
  category: 'iri_with_label' | 'uri_literal' | 'boolean' | 'lang_literal' | 'simple_literal';
  is_multi: boolean;
  filter_type: 'multiselect' | 'toggle' | 'slider' | 'datepicker' | 'none';
  datatype: string | null;
}

/** Active filters as held by App.svelte: dimension id -> selected values. */
export type Filters = Record<string, string[] | string | undefined>;
