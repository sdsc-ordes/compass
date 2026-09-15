/**
 * The story count — the one thing on the panel that needs a backend.
 *
 * GET {apiurl}/api/v1/stories/count?lang=&tags=<iri>&tags=… -> { count, url }.
 * Asked with no tags too, because the answer carries the deployment's stories
 * URL. With no `apiurl` set there is no request and no story UI at all.
 */
export interface StoryCount {
  count: number;
  /** Where the block links: the filtered index when tags resolved, the plain
      index otherwise. Always the API's, which is configured per deployment
      (STORIES_BASE_URL_* in the root .env) — the widget names no host itself. */
  url: string;
}

/**
 * Debounces the request and hands the answer back through `onCount`.
 *
 * `schedule` is called from a reactive statement, so it must never assign
 * anything that statement reads: a statement that both reads and assigns the
 * timer re-dirties its own guard, and arming the timer would then clear and
 * re-arm it forever inside one flush. The timer stays in here for that reason.
 *
 * `onPending` is the second half of that contract, and it exists because this
 * request is slow in a way the map's own are not: the backend proxies a live
 * call to the stories provider, measured at 1.6-2.8s against 5-25ms for the
 * entity and facet queries. Add the debounce and the count on screen can be
 * three seconds out of date while looking entirely current. Pending is raised
 * the moment a fetch is scheduled — not when it goes out — so the debounce
 * window is inside the state rather than a blind spot before it.
 */
export class Stories {
  private timer: ReturnType<typeof setTimeout> | null = null;
  /* Two selections further apart than the debounce leave two requests in flight;
     if the first answers last, the tally states a stale count. */
  private seq = 0;

  constructor(
    private onCount: (c: StoryCount | null) => void,
    private onPending: (pending: boolean) => void = () => {},
    private delayMs = 300,
  ) {}

  schedule(on: boolean, apiurl: string, lang: string, iris: string[]): void {
    this.cancel();
    this.seq += 1;
    if (!on || !apiurl) {
      /* Nothing to say — and the tally's min-height reserves the line either way. */
      this.onPending(false);
      this.onCount(null);
      return;
    }
    /* An empty tag list is asked anyway, rather than short-circuited: the answer
       carries the deployment's own stories URL, which is the block's link when
       nothing is selected. Hard-coding that URL here is what this avoids. */
    /* The previous count stays up while this settles: an answer one click old reads
       better than a line that blanks and refills on every click. The pending flag
       is what stops that being a lie — the old number stays, marked as settling. */
    this.onPending(true);
    this.timer = setTimeout(() => this.fetch(apiurl, lang, iris), this.delayMs);
  }

  /** Drops the timer. Leaves `pending` alone: every caller either re-arms
      immediately or is tearing the widget down, and lowering it here would blink
      the state off and on between one selection and the next. */
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
      this.onPending(false);
    } catch (e) {
      if (seq !== this.seq) return;
      console.error('[Compass] Story count fetch error:', e);
      this.onCount(null);
      this.onPending(false);
    }
  }
}
