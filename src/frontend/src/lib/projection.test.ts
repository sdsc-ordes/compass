import { describe, expect, it } from 'vitest';
import { FOCUS_K_MAX, frameFor, initialView, proj, K_MIN, type ViewState } from './projection';

const W = 900;
const H = 620;

const flat = (): ViewState => ({ ...initialView(), k: 3, tx: -120, ty: 40 });
const globe = (): ViewState => ({ ...initialView(), view: 'globe', k: 2 });

// Where a point lands once the camera the fit asked for is in place.
const after = (S: ViewState, to: object, c: [number, number]) => proj({ ...S, ...to }, W, H)(c);

describe('frameFor', () => {
  it('has nothing to say about an empty set', () => {
    expect(frameFor(flat(), W, H, [])).toBeNull();
    expect(frameFor(globe(), W, H, [])).toBeNull();
  });

  it('brings every point of a flat frame onto the stage', () => {
    const pts: [number, number][] = [
      [6.6, 46.5],
      [13.4, 52.5],
      [-3.7, 40.4],
    ];
    const to = frameFor(flat(), W, H, pts)!;
    pts.forEach((c) => {
      const xy = after(flat(), to, c)!;
      expect(xy[0]).toBeGreaterThan(0);
      expect(xy[0]).toBeLessThan(W);
      expect(xy[1]).toBeGreaterThan(0);
      expect(xy[1]).toBeLessThan(H);
    });
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

  it('stops short of the tightest zoom the map allows', () => {
    const one: [number, number][] = [[8.5, 47.4]];
    expect(frameFor(flat(), W, H, one)!.k).toBe(FOCUS_K_MAX);
    expect(frameFor(globe(), W, H, one)!.k).toBe(FOCUS_K_MAX);
  });

  it('treats a set within metres of itself as a single point', () => {
    const huddle: [number, number][] = [
      [8.5, 47.4],
      [8.50001, 47.40001],
      [8.49999, 47.39999],
    ];
    expect(frameFor(flat(), W, H, huddle)!.k).toBe(FOCUS_K_MAX);
    expect(frameFor(globe(), W, H, huddle)!.k).toBe(FOCUS_K_MAX);
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
    // The centre is out at the dateline, not back at Greenwich as a min/max
    // over the longitudes would have it.
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

  it('never asks for a camera the map cannot hold', () => {
    const spread: [number, number][] = [
      [-60, -30],
      [60, 30],
    ];
    [flat(), globe()].forEach((S) => {
      const to = frameFor(S, W, H, spread)!;
      expect(to.k).toBeGreaterThanOrEqual(K_MIN);
      expect(to.k).toBeLessThanOrEqual(FOCUS_K_MAX);
    });
  });

  it('gives up on a stage with no size', () => {
    expect(frameFor(flat(), 0, 0, [[0, 0]])).toBeNull();
  });
});
