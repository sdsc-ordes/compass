export interface StoryCount {
  count: number;
  url: string;
}

// Fetches the story count for the selected tags, debounced, keeping only the
// answer to the latest query.
export class Stories {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private lastKey: string | null = null;
  // Only follow-ups are debounced: the first is the page loading, not a click.
  private first = true;

  constructor(
    private onCount: (c: StoryCount | null) => void,
    private onPending: (pending: boolean) => void = () => {},
    private delayMs = 300,
  ) {}

  schedule(enabled: boolean, apiurl: string, lang: string, iris: string[]): void {
    // Same query as last time: keep the pending or landed answer.
    const key = JSON.stringify([enabled, apiurl, lang, [...iris].sort()]);
    if (key === this.lastKey) return;
    this.cancel();
    this.lastKey = key;
    this.seq += 1;
    if (!enabled || !apiurl) {
      this.onPending(false);
      this.onCount(null);
      return;
    }
    this.onPending(true);
    const wait = this.first ? 0 : this.delayMs;
    this.first = false;
    this.timer = setTimeout(() => this.fetch(apiurl, lang, iris), wait);
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.lastKey = null;
  }

  private async fetch(apiurl: string, lang: string, iris: string[]): Promise<void> {
    const seq = this.seq;
    const params = new URLSearchParams({ lang });
    iris.forEach((iri) => params.append('tags', iri));
    let count: StoryCount | null = null;
    try {
      const resp = await fetch(`${apiurl}/api/v1/stories/count?${params}`);
      if (resp.ok) count = await resp.json();
    } catch (e) {
      if (seq === this.seq) console.error('[Compass] Story count fetch error:', e);
    }
    if (seq !== this.seq) return;
    this.onCount(count);
    this.onPending(false);
  }
}
