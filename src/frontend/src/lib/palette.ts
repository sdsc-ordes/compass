export interface Pal {
  page: string;
  sea: string;
  grat: string;
  land: string;
  coast: string;
  ctyLine: string;
  rim: string;
  lblCty: string;
  pin: string;
  pinSel: string;
  pinRing: string;
}

export type Theme = 'light' | 'dark';

export const P: Record<Theme, Pal> = {
  light: {
    page: '#F4F8FB',
    sea: '#E8F1F8',
    grat: 'rgba(42,78,113,.06)',
    land: '#FFFFFF',
    coast: 'rgba(42,78,113,.38)',
    ctyLine: 'rgba(42,78,113,.2)',
    rim: 'rgba(42,78,113,.55)',
    lblCty: '#2A4E71',
    pin: '#2A4E71',
    pinSel: '#ED6D52',
    pinRing: 'rgba(0,0,0,.18)',
  },
  dark: {
    page: '#081827',
    sea: '#1B3C5A',
    grat: 'rgba(200,225,245,.05)',
    land: '#081827',
    coast: 'rgba(168,194,213,.34)',
    ctyLine: 'rgba(168,194,213,.2)',
    rim: 'rgba(200,225,245,.35)',
    lblCty: '#C8D6E3',
    pin: '#FFFFFF',
    pinSel: '#ED6D52',
    pinRing: 'rgba(0,0,0,.35)',
  },
};
