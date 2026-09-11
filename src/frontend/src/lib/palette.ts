/**
 * Stage palette — the whole map is painted from here, light and dark.
 *
 * Ported verbatim from the design prototype's `P`. The sidebar chrome keeps its
 * own light palette in styles/ throughout; only a handful of vars are shared.
 */
export interface Pal {
  page: string;
  card: string;
  rule: string;
  brand: string;
  dim: string;
  sea: string;
  bands: string[];
  iso: string;
  grat: string;
  land: string;
  landHi: string;
  coast: string;
  ctyLine: string;
  rim: string;
  lblCty: string;
  trench: string;
  ridge: string;
  lat: string;
  pin: string;
  pinSel: string;
  pinRing: string;
  pinHalo: string;
}

export type Theme = 'light' | 'dark';

export const P: Record<Theme, Pal> = {
  light: {
    page: '#F4F8FB',
    card: 'rgba(255,255,255,.95)',
    rule: '#D2DFE9',
    brand: '#2A4E71',
    dim: '#6E8299',
    sea: '#E8F1F8',
    bands: ['#C9DEEE', '#A3C5DE', '#7AA6C7', '#4E7CA2', '#2A4E71'],
    iso: 'rgba(255,255,255,.22)',
    grat: 'rgba(42,78,113,.06)',
    land: '#FFFFFF',
    landHi: '#FFFFFF',
    coast: 'rgba(42,78,113,.38)',
    ctyLine: 'rgba(42,78,113,.2)',
    rim: 'rgba(42,78,113,.55)',
    lblCty: '#2A4E71',
    trench: 'rgba(255,255,255,.5)',
    ridge: 'rgba(255,255,255,.28)',
    lat: 'rgba(42,78,113,.22)',
    pin: '#0171B4',
    pinSel: '#ED6D52',
    pinRing: 'rgba(0,0,0,.18)',
    pinHalo: 'rgba(255,255,255,.45)',
  },
  dark: {
    page: '#081827',
    card: 'rgba(11,33,54,.94)',
    rule: '#1E3D57',
    brand: '#8FC3E4',
    dim: '#7C99AE',
    sea: '#1B3C5A',
    bands: ['#285880', '#234F72', '#1E4664', '#193D56', '#143448'],
    iso: 'rgba(200,225,245,.18)',
    grat: 'rgba(200,225,245,.05)',
    land: '#081827',
    landHi: '#081827',
    coast: 'rgba(168,194,213,.34)',
    ctyLine: 'rgba(168,194,213,.2)',
    rim: 'rgba(200,225,245,.35)',
    lblCty: '#C8D6E3',
    trench: 'rgba(200,225,245,.34)',
    ridge: 'rgba(200,225,245,.14)',
    lat: 'rgba(200,225,245,.18)',
    pin: '#0171B4',
    pinSel: '#ED6D52',
    pinRing: 'rgba(0,0,0,.35)',
    pinHalo: 'rgba(127,182,218,.3)',
  },
};
