/**
 * The animals that stand in for a wait.
 *
 * The widget has two waits and both are slow enough to need something on
 * screen: the story count is the backend proxying a live call out to the
 * provider, and the map plate is up for as long as the wasm engine takes to
 * boot. One animal crosses the water for both, and which animal it is is
 * decided once per page load — see CREATURE.
 *
 * Each is a filled silhouette on its own grid, hand-authored rather than pulled
 * from a font: @font-face is ignored inside a shadow root, and an icon set would
 * be a second network dependency in a widget whose whole point is that it ships
 * as one self-contained file. They are not in lib/icons.ts because that set is
 * the stage chrome's — 24x24, stroked, and every entry a control's glyph.
 *
 * They are drawn facing right, sitting on the waterline, and are sized in the
 * stylesheet rather than here: `width` and `height` are the rendered size in px,
 * chosen per animal so each reads at its own level of detail. The bear is the
 * largest because a head in profile carries more of it than a whole body does.
 *
 * Each one's motion is its own — see styles/swimmer.css. A shared arc would have
 * been cheaper and it would have had a polar bear doing backflips in it.
 */
export interface Creature {
  /** Class hook and keyframe suffix: .swim-<id>, @keyframes swim-<id>. */
  id: string;
  viewBox: string;
  /** Rendered size in px. */
  width: number;
  height: number;
  /** The silhouette. */
  path: string;
  /** Drawn with the body, animated apart: the whale's spout. */
  puff?: string;
}

export const FAUNA: Creature[] = [
  {
    /** Beak, melon and a backswept dorsal — what separates it from the shark. */
    id: 'dolphin',
    viewBox: '0 0 48 32',
    width: 39,
    height: 26,
    path: `M47 13.8 C45.4 12.9 43.6 12.4 42 12.2 C41 10.2 40 8.8 38 8.2
           C34.6 6.4 31 5.7 28 6 C26.4 4.8 24.8 3.6 23 2.8
           C23.8 4.4 24.4 5.8 24.6 7.2 C18.8 8.4 12.6 10.6 7.4 13.6
           C5.6 12 3.4 10.6 1.1 9.6 C2.6 12 3.8 14 4.4 16.2
           C3.6 18.4 2.2 20.4 0.6 22.2 C3.4 21.4 6 20 8.6 18
           C12 16.8 16 16.2 20 16 C19 18.4 18.6 21 18.8 23.4
           C21 20.8 23.4 18.6 26.2 17 C31 16.2 36 15.4 41 14.9
           C43 14.7 45.4 14.4 47 13.8 Z`,
  },
  {
    /** Blunt head, a dorsal set far back and broad flukes: the bulk is the
        read at this size, so the body is deep where the dolphin's is slim. */
    id: 'whale',
    /* The origin is above the top of the body on purpose: the blow needs room to
       rise into, and giving it there rather than moving the body down keeps the
       whale at the same depth for the same `bottom`. */
    viewBox: '0 -10 56 42',
    width: 56,
    height: 42,
    path: `M55 15 C55 11 51 8.6 45 8 C37 7.2 28 8.2 20.6 10.4
           C19.8 8.4 18.6 7.2 17 6.6 C17.6 8.2 17.8 9.6 17.6 11.2
           C13.4 12.8 9.6 14.6 6.4 16.8 C4.8 13.6 3.2 10.6 1.2 7.8
           C3.8 11 5.4 14.2 5.8 17.6 C4.6 20.8 2.8 23.6 0.6 26.2
           C4.2 24.6 7.6 22.4 10.6 20.2 C15 18.6 20 19.8 26 20.4
           C34 21.8 42 21.6 48 20.2 C52.6 19 55 17.4 55 15 Z`,
    /** The blow, over the blowhole at the back of the head. Fades in while the
        whale is up and is gone before it dives. */
    puff: `M45.2 8.2 C44 3.4 44.4 -1.8 46.4 -7.8 C47 -2.4 48.6 1 51 3.6
           C49 4.6 47 6.2 45.2 8.2 Z`,
  },
  {
    /** The fin alone. A shark that never leaves the water is the one animal
        here whose whole silhouette is a single edge, so it is drawn as one. */
    id: 'shark',
    viewBox: '0 0 24 18',
    width: 32,
    height: 24,
    path: 'M19.4 18 C17.2 11.4 13.2 5.4 8 2 C9.6 7 8.4 13 3 18 Z',
  },
  {
    /** Head in profile: rounded skull, one ear, and the muzzle tapering to the
        nose. The muzzle is what stops it reading as a seal. */
    id: 'bear',
    viewBox: '0 0 44 24',
    width: 60,
    height: 33,
    path: `M11.5 22 C10.8 18 11 13.8 12.4 10.6 C12.8 9.6 13.4 8.6 14.2 7.8
           C14 5.4 15.4 3.2 17.6 3.2 C19.6 3.2 21 4.8 21 6.8
           C23.4 5.6 26.2 5.8 28.2 7.2 C29.6 8.4 30.4 10.2 30.8 12.2
           C33.2 12.2 36 12.8 37.8 13.8 C39.2 14.6 39.4 16.2 38.4 17.2
           C37.6 18 36.2 18.2 34.8 18 C33 17.8 31.4 18.2 30.2 18.8
           C28.8 19.8 27.6 21 27 22 Z`,
  },
];

/**
 * The one this page gets, drawn once at module load.
 *
 * Per load rather than per wait: both waits then show the same animal, so a
 * session has a character rather than a carousel, and the tally box does not
 * change species on every filter click. A reload is what turns it over.
 */
export const CREATURE: Creature = FAUNA[Math.floor(Math.random() * FAUNA.length)];
