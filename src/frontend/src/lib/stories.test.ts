import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Stories, type StoryCount } from './stories';

/**
 * The pending flag exists because this one request is slow enough to lie about:
 * a count that stays on screen through a 3s refetch looks entirely current. Its
 * edges are all ordering, which is what these cover.
 */
const answer = (count: number): StoryCount => ({ count, url: 'https://example.org/s' });

/** A fetch that resolves when the test says so, not when the event loop drains. */
function deferredFetch() {
  const pendingResolvers: Array<(c: StoryCount) => void> = [];
  const stub = vi.fn(
    () =>
      new Promise((resolve) => {
        pendingResolvers.push((c) => resolve({ ok: true, json: async () => c } as Response));
      }),
  );
  return { stub, settle: (i: number, c: StoryCount) => pendingResolvers[i](c) };
}

describe('Stories', () => {
  let counts: Array<StoryCount | null>;
  let pending: boolean[];

  const make = (fetchStub: typeof fetch) => {
    vi.stubGlobal('fetch', fetchStub);
    return new Stories(
      (c) => counts.push(c),
      (p) => pending.push(p),
      10,
    );
  };

  beforeEach(() => {
    counts = [];
    pending = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is pending from the moment a fetch is scheduled, not when it goes out', () => {
    const { stub } = deferredFetch();
    const s = make(stub as unknown as typeof fetch);
    s.schedule(true, 'http://api', 'en', []);
    // Still inside the debounce: nothing has been requested, and the flag is
    // already up. A flag raised at request time would leave the window blind.
    expect(stub).not.toHaveBeenCalled();
    expect(pending).toEqual([true]);
  });

  it('lowers pending once the answer lands', async () => {
    const { stub, settle } = deferredFetch();
    const s = make(stub as unknown as typeof fetch);
    s.schedule(true, 'http://api', 'en', ['iri']);
    await vi.advanceTimersByTimeAsync(10);
    settle(0, answer(7));
    await vi.waitFor(() => expect(counts).toEqual([answer(7)]));
    expect(pending).toEqual([true, false]);
  });

  it('stays pending when a superseded answer arrives first', async () => {
    const { stub, settle } = deferredFetch();
    const s = make(stub as unknown as typeof fetch);
    s.schedule(true, 'http://api', 'en', ['a']);
    await vi.advanceTimersByTimeAsync(10);
    s.schedule(true, 'http://api', 'en', ['b']);
    await vi.advanceTimersByTimeAsync(10);

    // The first request answers last. It must not count, and it must not report
    // the second one finished: that would clear the state while it is in flight.
    settle(0, answer(99));
    await vi.advanceTimersByTimeAsync(0);
    expect(counts).toEqual([]);
    expect(pending).toEqual([true, true]);

    settle(1, answer(3));
    await vi.waitFor(() => expect(counts).toEqual([answer(3)]));
    expect(pending).toEqual([true, true, false]);
  });

  it('is not pending with nothing to ask', () => {
    const { stub } = deferredFetch();
    const s = make(stub as unknown as typeof fetch);
    s.schedule(true, '', 'en', []);
    expect(stub).not.toHaveBeenCalled();
    expect(pending).toEqual([false]);
    expect(counts).toEqual([null]);
  });

  it('lowers pending when the request fails', async () => {
    // The class logs the failure on purpose; the test asserts the state, not the
    // console, and a stack trace in a green run reads as a broken one.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = make(
      vi.fn(async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    );
    s.schedule(true, 'http://api', 'en', ['iri']);
    await vi.advanceTimersByTimeAsync(10);
    await vi.waitFor(() => expect(counts).toEqual([null]));
    expect(pending).toEqual([true, false]);
  });
});
