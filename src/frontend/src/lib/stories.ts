/**
 * The story count — the one thing on the panel that needs a backend.
 *
 * GET {apiurl}/api/v1/stories/count?lang=&tags=<iri>&tags=… -> { count, url }.
 * With no `apiurl` set there is no request and no story UI at all.
 */
/**
 * The unfiltered stories index, per language.
 *
 * Needed with no backend and before any filter is set, which is exactly when
 * /api/stories/count is never called — schedule() returns early on an empty tag
 * list, so there is no response to read a base URL out of. DetailPane held its
 * own copy of these two URLs; this is the one place now.
 */
export const storiesBaseUrl = (lang: string): string =>
  lang === 'de'
    ? 'https://www.oceancare.org/de/storys-and-news/'
    : 'https://www.oceancare.org/en/stories-and-news/';

export interface StoryCount {
  count: number;
  url: string;
}

/**
 * Debounces the request and hands the answer back through `onCount`.
 *
 * `schedule` is called from a reactive statement, so it must never assign
 * anything that statement reads: a statement that both reads and assigns the
 * timer re-dirties its own guard, and arming the timer would then clear and
 * re-arm it forever inside one flush. The timer stays in here for that reason.
 */
export class Stories {
  private timer: ReturnType<typeof setTimeout> | null = null;
  /* Two selections further apart than the debounce leave two requests in flight;
     if the first answers last, the tally states a stale count. */
  private seq = 0;

  constructor(
    private onCount: (c: StoryCount | null) => void,
    private delayMs = 300,
  ) {}

  schedule(on: boolean, apiurl: string, lang: string, iris: string[]): void {
    this.cancel();
    this.seq += 1;
    if (!on || !apiurl || iris.length === 0) {
      /* Nothing to say — and the tally's min-height reserves the line either way. */
      this.onCount(null);
      return;
    }
    /* The previous count stays up while this settles: an answer one click old reads
       better than a line that blanks and refills on every click. */
    this.timer = setTimeout(() => this.fetch(apiurl, lang, iris), this.delayMs);
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async fetch(apiurl: string, lang: string, iris: string[]): Promise<void> {
    const seq = this.seq;
    try {
      const params = new URLSearchParams({ lang });
      iris.forEach((iri) => params.append('tags', iri));
      const resp = await fetch(`${apiurl}/api/v1/stories/count?${params.toString()}`);
      if (seq !== this.seq) return;
      this.onCount(resp.ok ? await resp.json() : null);
    } catch (e) {
      if (seq !== this.seq) return;
      console.error('[Compass] Story count fetch error:', e);
      this.onCount(null);
    }
  }
}
