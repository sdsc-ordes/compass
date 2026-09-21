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
  // The globe's terminator wash. Astronaut by day, NIGHT_INK after dark.
  shade: string;
  // The same colour at zero alpha: the gradient's middle stop, where the wash
  // fades out. Inert as a colour, but it steers the interpolation.
  shadeFade: string;
}

// Astronaut, and the near-black the night map is painted in. Named here because
// both are read from more than one module: the pins draw their edge in Astronaut
// and their ink in the night colour, and .mapc.night .stage carries a fourth copy
// in CSS that no import can reach -- keep that one in step by hand.
export const ASTRONAUT = '#2A4E71';
export const NIGHT_INK = '#081827';

// Canvas wants rgba() strings, so every wash of the two colours above is derived
// rather than written out again -- four hand-synced spellings of one colour is
// how they drift.
const wash = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

export type Theme = 'light' | 'dark';

export const P: Record<Theme, Pal> = {
  light: {
    page: '#FFFFFF',
    sea: '#E8F1F8',
    grat: wash(ASTRONAUT, 0.06),
    land: '#FFFFFF',
    coast: wash(ASTRONAUT, 0.38),
    ctyLine: wash(ASTRONAUT, 0.2),
    rim: wash(ASTRONAUT, 0.55),
    lblCty: ASTRONAUT,
    pin: ASTRONAUT,
    pinSel: '#ED6D52',
    pinRing: 'rgba(0,0,0,.18)',
    shade: wash(ASTRONAUT, 0.26),
    shadeFade: wash(ASTRONAUT, 0),
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
    shade: wash(NIGHT_INK, 0.5),
    shadeFade: wash(NIGHT_INK, 0),
  },
};
