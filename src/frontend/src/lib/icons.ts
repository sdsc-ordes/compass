/**
 * The stage chrome's icons, as path data on a 24x24 grid.
 *
 * Hand-authored rather than pulled from a font. The design system names Font
 * Awesome 5 Free Solid, but @font-face is ignored inside a shadow root — it
 * would need the document.head injection lib/fonts.ts does for Cabin — and it
 * would put a second network dependency into a widget whose whole point is that
 * it ships as one self-contained file.
 *
 * They are stroked, not solid: a map, a globe and a magnifier all need interior
 * lines, and as solid silhouettes those have to be punched out with even-odd
 * subpaths, which is fiddly to author by hand and muddy at 15px. One coherent
 * 2px-stroke set reads better than a mix. components/Icon.svelte supplies the
 * stroke; every entry here is geometry only.
 */
export const ICONS = {
  /** Settings: two tracks with knobs — the panel behind it holds switches. */
  sliders: [
    'M3.5 8.5h4',
    'M12.5 8.5h8',
    'M12.5 8.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0',
    'M3.5 15.5h8',
    'M16.5 15.5h4',
    'M16.5 15.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0',
  ],
  /** The flat projection: a folded paper map. */
  mapFlat: ['M3 6.6 9 4.4 15 6.6 21 4.4V17.4l-6 2.2-6-2.2-6 2.2Z', 'M9 4.4v13', 'M15 6.6v13'],
  /** The globe projection: sphere, equator, one meridian. */
  globe: [
    'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    'M3 12h18',
    'M12 3a4.6 9 0 0 1 0 18 4.6 9 0 0 1 0-18',
  ],
  /** Light theme. */
  sun: [
    'M15.8 12a3.8 3.8 0 1 1-7.6 0 3.8 3.8 0 0 1 7.6 0',
    'M12 2.6v2.1',
    'M12 19.3v2.1',
    'M2.6 12h2.1',
    'M19.3 12h2.1',
    'M5.4 5.4 6.9 6.9',
    'M17.1 17.1l1.5 1.5',
    'M18.6 5.4 17.1 6.9',
    'M6.9 17.1 5.4 18.6',
  ],
  /** Dark theme. */
  moon: ['M20.5 14.6A8.5 8.5 0 1 1 9.4 3.5 8.5 8.5 0 1 0 20.5 14.6Z'],
  zoomIn: [
    'M17.5 10.5a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
    'M15.6 15.6 21 21',
    'M10.5 7.2v6.6',
    'M7.2 10.5h6.6',
  ],
  zoomOut: ['M17.5 10.5a7 7 0 1 1-14 0 7 7 0 0 1 14 0', 'M15.6 15.6 21 21', 'M7.2 10.5h6.6'],
  /** Off-site: the diagonal arrow convention, on every link that opens a tab. */
  extLink: ['M7 17 17 7', 'M10.5 7H17v6.5'],
  /** Reset the view: three quarters of a turn, arrowhead at the end of travel. */
  reset: ['M20 12a8 8 0 1 1-8-8', 'M10 1.9 12.4 4 10 6.1'],
  /* The three below are the first-load coach's mime, not controls: a pointer, a
     touch hand, and a stand-in pin for them to act on. See components/Coach. */
  /** Fine pointer: the classic arrow, tip at the top left. */
  cursor: ['M5 2.5 5 17.8 8.9 14.1 11.6 20.8 14.1 19.6 11.5 13.2 16.6 12.6Z'],
  /** A mouse, for the scroll mime: body, and the wheel as a short stub. */
  mouse: [
    'M8 3.5h8a3.5 3.5 0 0 1 3.5 3.5v10a3.5 3.5 0 0 1-3.5 3.5H8a3.5 3.5 0 0 1-3.5-3.5V7A3.5 3.5 0 0 1 8 3.5Z',
  ],
  /** Rises above the mouse on the scroll beat, and doubles as a generic chevron. */
  chevronUp: ['M6 14 12 8l6 6'],
  /** Coarse pointer: the web's tap hand — index finger up, palm below. */
  hand: [
    'M10.5 12.5V6.3a1.75 1.75 0 0 1 3.5 0V13',
    'M14 10.6a1.75 1.75 0 0 1 3.5 0V13',
    'M17.5 11.6a1.75 1.75 0 0 1 3.5 0v3.9a5.5 5.5 0 0 1-5.5 5.5h-1.9a5 5 0 0 1-3.54-1.46l-3.1-3.1a1.75 1.75 0 0 1 2.48-2.48l1.56 1.56',
  ],
  /* The four below head the filter accordion's sections, one per tag dimension.
     Mapped to dimensions in lib/schema.ts, not here: this file is geometry and
     that one already owns which dimensions the panel draws. */
  /** Species: a whale's fluke. It names the flagship rather than the whole
      dimension — ten animals sit under it, seals and turtles included — and that
      is deliberate: whales and dolphins are the two species tags the stories
      index can actually answer for. It is also the only shape here that reads as
      a whale rather than as a generic fish; a side profile at this size came out
      as a fish with a triangle behind it, and a spout on top read as a crown. */
  whale: [
    'M12 20.6c0-4.2-1.4-7.2-4.1-9.4-2.3-1.9-4.4-2.4-6.1-2.1 1.7-3.1 4.5-4.5 7-4.5 1.6 0 2.7 0.6 3.2 1.9 0.5-1.3 1.6-1.9 3.2-1.9 2.5 0 5.3 1.4 7 4.5-1.7-0.3-3.8 0.2-6.1 2.1-2.7 2.2-4.1 5.2-4.1 9.4Z',
  ],
  /** Topic: a tag, hole at the corner — the codebase's own word for these
      dimensions. Set on the diagonal rather than as a pointed label, which at
      this size reads as a back arrow and would sit two rows from real
      navigation. */
  tag: [
    'M20.1 12.9l-7.2 7.2a1.9 1.9 0 0 1-2.7 0l-7.3-7.3a1.9 1.9 0 0 1-.55-1.5l.5-5.3a1.9 1.9 0 0 1 1.72-1.72l5.3-.5a1.9 1.9 0 0 1 1.5.55l7.3 7.3a1.9 1.9 0 0 1 0 2.7Z',
    'M8.3 8.3h.01',
  ],
  /** Work Area: a briefcase — the dimension is kinds of work (advocacy,
      petitions, expeditions), not places, despite the name. */
  briefcase: [
    'M3.5 8.6h17v9.4a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6Z',
    'M9.2 8.6V6.4a1.6 1.6 0 0 1 1.6-1.6h2.4a1.6 1.6 0 0 1 1.6 1.6v2.2',
    'M3.5 13.2h17',
  ],
  /** Related Project: a folder. A relation rather than a tag, and a folder says
      "the named thing this belongs to" where a tag would say "a theme". */
  folder: [
    'M3.5 18.4V6.6A1.6 1.6 0 0 1 5.1 5h3.8a1.6 1.6 0 0 1 1.28 0.64l1.22 1.66h7.5a1.6 1.6 0 0 1 1.6 1.6v9.5a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6Z',
  ],
  /** A stand-in pin for the coach to tap. Not the canvas pin — that one is drawn
      by lib/pins.ts and lives in a different coordinate space entirely. */
  pinMini: [
    'M12 21.4C12 21.4 18.2 14.7 18.2 10.2A6.2 6.2 0 1 0 5.8 10.2C5.8 14.7 12 21.4 12 21.4Z',
    'M14.4 10.1a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0',
  ],
} as const;

export type IconName = keyof typeof ICONS;
