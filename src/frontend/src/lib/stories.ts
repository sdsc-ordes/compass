export interface StoryCount {
  count: number;
  url: string;
}

export class Stories {
  private timer: ReturnType<typeof setTimeout> | null = null;
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
      this.onPending(false);
      this.onCount(null);
      return;
    }
    this.onPending(true);
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
      this.onPending(false);
    } catch (e) {
      if (seq !== this.seq) return;
      console.error('[Compass] Story count fetch error:', e);
      this.onCount(null);
      this.onPending(false);
    }
  }
}
