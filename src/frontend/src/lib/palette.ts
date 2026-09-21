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

// Astronaut, and the near-black the night map is painted in. Named here because
// both are read from more than one module: the pins draw their edge in Astronaut
// and their ink in the night colour, and .mapc.night .stage carries a fourth copy
// in CSS that no import can reach -- keep that one in step by hand.
export const ASTRONAUT = '#2A4E71';
export const NIGHT_INK = '#081827';

export type Theme = 'light' | 'dark';

export const P: Record<Theme, Pal> = {
  light: {
    page: '#FFFFFF',
    sea: '#E8F1F8',
    grat: 'rgba(42,78,113,.06)',
    land: '#FFFFFF',
    coast: 'rgba(42,78,113,.38)',
    ctyLine: 'rgba(42,78,113,.2)',
    rim: 'rgba(42,78,113,.55)',
    lblCty: ASTRONAUT,
    pin: ASTRONAUT,
    pinSel: '#ED6D52',
    pinRing: 'rgba(0,0,0,.18)',
  },
  dark: {
    page: NIGHT_INK,
    sea: '#1B3C5A',
    grat: 'rgba(200,225,245,.05)',
    land: NIGHT_INK,
    coast: 'rgba(168,194,213,.34)',
    ctyLine: 'rgba(168,194,213,.2)',
    rim: 'rgba(200,225,245,.35)',
    lblCty: '#C8D6E3',
    pin: '#FFFFFF',
    pinSel: '#ED6D52',
    pinRing: 'rgba(0,0,0,.35)',
  },
};
