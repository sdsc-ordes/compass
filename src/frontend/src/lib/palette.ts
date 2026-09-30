export interface Palette {
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
  // The globe's terminator wash.
  shade: string;
  // `shade` at zero alpha, for the gradient's middle stop, so the fade does not
  // pass through another hue.
  shadeFade: string;
}

// NIGHT_INK is also hard-coded in styles/stage.css (.mapc.night .stage).
export const ASTRONAUT = '#2A4E71';
export const NIGHT_INK = '#081827';

const wash = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

export type Theme = 'light' | 'dark';

export const PALETTES: Record<Theme, Palette> = {
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
