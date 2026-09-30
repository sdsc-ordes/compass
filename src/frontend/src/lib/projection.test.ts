import { describe, expect, it } from 'vitest';
import { FOCUS_K_MAX, frameFor, initialView, proj, K_MIN, type ViewState } from './projection';

const W = 900;
const H = 620;

const flat = (): ViewState => ({ ...initialView(), k: 3, tx: -120, ty: 40 });
const globe = (): ViewState => ({ ...initialView(), view: 'globe', k: 2 });

// Where a point lands once the camera the fit asked for is in place.
const after = (S: ViewState, to: object, c: [number, number]) => proj({ ...S, ...to }, W, H)(c);

// Seeded point sets of 1-6 points (mulberry32), so failures reproduce.
function randomSets(seed: number, count: number): [number, number][][] {
  let state = seed;
  const rand = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () =>
    Array.from({ length: 1 + Math.floor(rand() * 6) }, (): [number, number] => [
      rand() * 360 - 180,
      rand() * 160 - 80,
    ]),
  );
}

describe('frameFor', () => {
  it('has nothing to say about an empty set', () => {
    expect(frameFor(flat(), W, H, [])).toBeNull();
    expect(frameFor(globe(), W, H, [])).toBeNull();
  });

  it('keeps k within [K_MIN, FOCUS_K_MAX] and every flat point on the stage', () => {
    for (const pts of randomSets(7, 300)) {
      for (const S of [flat(), globe()]) {
        const { k } = frameFor(S, W, H, pts)!;
        expect(k).toBeGreaterThanOrEqual(K_MIN);
        expect(k).toBeLessThanOrEqual(FOCUS_K_MAX);
      }
      const to = frameFor(flat(), W, H, pts)!;
      pts.forEach((c) => {
        const [x, y] = after(flat(), to, c)!;
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(W);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(H);
      });
    }
  });

  it('centres a flat frame on the set it framed', () => {
    const pts: [number, number][] = [
      [-10, -20],
      [30, 20],
    ];
    const to = frameFor(flat(), W, H, pts)!;
    const xs = pts.map((c) => after(flat(), to, c)![0]);
    const ys = pts.map((c) => after(flat(), to, c)![1]);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(W / 2, 6);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(H / 2, 6);
  });

  it.each([
    ['a single point', [[8.5, 47.4]]],
    [
      'points metres apart',
      [
        [8.5, 47.4],
        [8.50001, 47.40001],
        [8.49999, 47.39999],
      ],
    ],
  ] as [string, [number, number][]][])('stops at FOCUS_K_MAX for %s', (_name, pts) => {
    expect(frameFor(flat(), W, H, pts)!.k).toBe(FOCUS_K_MAX);
    expect(frameFor(globe(), W, H, pts)!.k).toBe(FOCUS_K_MAX);
  });

  it('stops at the world view for a flat set too wide to pad', () => {
    const pts: [number, number][] = [
      [-180, 0],
      [180, 0],
      [0, -60],
      [0, 70],
    ];
    const to = frameFor(flat(), W, H, pts)!;
    expect(to.k).toBe(K_MIN);
    expect(to.rot).toBeUndefined();
  });

  it('turns the globe to the short way round the antimeridian', () => {
    const pts: [number, number][] = [
      [170, 10],
      [-170, -10],
    ];
    const to = frameFor(globe(), W, H, pts)!;
    expect(Math.abs(to.rot![0])).toBeCloseTo(180, 6);
    expect(to.rot![1]).toBeCloseTo(0, 6);
    expect(to.k).toBeGreaterThan(1);
    expect(to.tx).toBeUndefined();
  });

  it('cannot fit more than a hemisphere on the globe', () => {
    const pts: [number, number][] = [
      [0, 0],
      [180, 0],
      [90, 0],
    ];
    expect(frameFor(globe(), W, H, pts)!.k).toBe(K_MIN);
  });

  it('frames a globe set inside the disc', () => {
    const pts: [number, number][] = [
      [6.6, 46.5],
      [13.4, 52.5],
      [-3.7, 40.4],
    ];
    const to = frameFor(globe(), W, H, pts)!;
    pts.forEach((c) => {
      const xy = after(globe(), to, c)!;
      expect(Math.hypot(xy[0] - W / 2, xy[1] - H / 2)).toBeLessThan(Math.min(W, H) / 2);
    });
  });

  it('gives up on a stage with no size', () => {
    expect(frameFor(flat(), 0, 0, [[0, 0]])).toBeNull();
  });
});
