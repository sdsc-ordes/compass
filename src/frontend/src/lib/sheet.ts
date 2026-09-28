import { onFontsReady } from './fonts';
import { REDUCED } from './projection';

export type SheetState = 'dock' | 'half' | 'full';

const MOBILE_QUERY = '(max-width:860px)';

const MOBILE: MediaQueryList =
  typeof window === 'undefined'
    ? ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      } as unknown as MediaQueryList)
    : window.matchMedia(MOBILE_QUERY);

export const isMobile = (): boolean => MOBILE.matches;

function onMobileChange(cb: (mobile: boolean) => void): () => void {
  const handler = () => cb(MOBILE.matches);
  MOBILE.addEventListener('change', handler);
  return () => MOBILE.removeEventListener('change', handler);
}

const SHEET_HALF = 0.58;

// Where the map's floating filter chips end, from the stage's top; 0 when none show.
export function chipsBottom(stage: HTMLElement): number {
  const bar = stage.querySelector<HTMLElement>('.chipbar');
  return bar?.offsetHeight
    ? bar.getBoundingClientRect().bottom - stage.getBoundingClientRect().top
    : 0;
}

export interface SheetHost {
  mapc: HTMLElement;
  sidebar: HTMLElement;
  grab: HTMLElement;
  backdrop: HTMLElement;
  dockFloor: HTMLElement;
  stage: HTMLElement;
  isDetail: () => boolean;
  queue: (full?: boolean) => void;
  dismiss: () => void;
}

export class Sheet {
  state: SheetState = 'dock';
  private offsets: Record<SheetState, number> | null = null;
  private paintTimer: ReturnType<typeof setTimeout> | null = null;
  private armAt = 0;
  private dockH = 0;
  private teardown: (() => void)[] = [];

  constructor(private h: SheetHost) {}

  get mobile(): boolean {
    return isMobile();
  }

  // An entry opens to half over the live map and up to the full pane;
  // pulling down from half dismisses it.
  private stops(): SheetState[] {
    return this.h.isDetail() ? ['half', 'full'] : ['dock', 'half', 'full'];
  }

  // The resting stop, where the content drags the sheet rather than scrolls.
  private low(): boolean {
    return this.state === (this.h.isDetail() ? 'half' : 'dock');
  }

  // The map left seen between the filter chips and the sheet at a stop, as
  // [top, bottom] from the stage's top. Off the stop, not the screen: the sheet
  // may still be sliding there.
  band(state: SheetState = this.state): [number, number] {
    const { stage, mapc } = this.h;
    const H = stage.clientHeight;
    if (!this.mobile) return [0, H];
    const box = mapc.clientHeight || window.innerHeight;
    return [chipsBottom(stage), Math.min(H, box - this.seen(state))];
  }

  // Centres the pin in the map that half leaves above it, below the filter chips.
  lift(): number {
    if (!this.mobile) return 0;
    const [top, bot] = this.band('half');
    return this.h.stage.clientHeight / 2 - (top + bot) / 2;
  }

  // How much of the sheet shows at a stop, from its top.
  private seen(state: SheetState): number {
    return this.h.sidebar.offsetHeight - (this.offsets ?? this.measure())[state];
  }

  measure(): Record<SheetState, number> {
    const { sidebar: sh, grab, mapc, dockFloor } = this.h;
    const H = mapc.clientHeight || window.innerHeight;
    const sheetH = sh.offsetHeight;
    const grabH = grab.offsetHeight || 58;
    const floorH = dockFloor.offsetHeight;
    if (floorH) this.dockH = grabH + floorH;
    const dock = this.dockH || grabH + 62;
    mapc.style.setProperty('--dock', dock + 'px');
    mapc.style.setProperty('--grabh', grabH + 'px');
    this.offsets = {
      // all the way up, the same panel the desktop rail shows
      full: 0,
      half: Math.max(0, sheetH - Math.round(H * SHEET_HALF)),
      dock: Math.max(0, sheetH - dock),
    };
    return this.offsets;
  }

  to(state: SheetState): void {
    const { sidebar: sh, backdrop: bd, grab } = this.h;
    if (!this.mobile) {
      sh.style.transform = '';
      sh.removeAttribute('data-sheet');
      bd.classList.remove('on');
      bd.setAttribute('aria-hidden', 'true');
      grab.setAttribute('aria-expanded', 'false');
      return;
    }
    const stops = this.stops();
    if (!stops.includes(state)) state = stops[0];
    this.state = state;
    sh.dataset.sheet = state;
    this.slide(this.measure()[state]);
    if (this.low()) sh.scrollTop = 0;
    // 'half' leaves the map live above it, so filter changes show on the pins
    // and another pin can be picked.
    const shaded = state === 'full';
    bd.classList.toggle('on', shaded);
    bd.setAttribute('aria-hidden', String(!shaded));
    grab.setAttribute('aria-expanded', String(!this.low()));
    if (shaded) this.armAt = performance.now() + 400;
    if (this.paintTimer) clearTimeout(this.paintTimer);
    this.paintTimer = setTimeout(() => this.h.queue(true), 340);
  }

  toggle(): void {
    this.to(this.state === 'full' ? this.stops()[0] : 'full');
  }

  wire(): void {
    const { sidebar: sh, grab, backdrop: bd, dockFloor } = this.h;
    let pid: number | null = null,
      y0 = 0,
      off0 = 0,
      dy = 0,
      t0 = 0;

    // The drag itself, shared by the grab (pointer) and the content (touch).
    const begin = (y: number) => {
      y0 = y;
      dy = 0;
      t0 = performance.now();
      off0 = this.measure()[this.state];
      sh.classList.add('dragging');
    };
    const track = (y: number) => {
      if (!this.offsets) return;
      dy = y - y0;
      const floor = this.h.isDetail() ? this.offsets.half + 150 : this.offsets.dock + 40;
      this.slide(Math.max(-28, Math.min(floor, off0 + dy)));
    };
    const settle = (tap: boolean) => {
      sh.classList.remove('dragging');
      const v = dy / Math.max(1, performance.now() - t0);
      if (tap && Math.abs(dy) < 6) {
        this.toggle();
        return;
      }
      // An entry steps one stop per swipe, and off the bottom from half.
      if (this.h.isDetail()) {
        if (dy > 60 || v > 0.45) {
          if (this.state === 'half') this.h.dismiss();
          else this.to('half');
        } else this.to(dy < -60 || v < -0.45 ? 'full' : this.state);
        return;
      }
      const target = off0 + dy + (Math.abs(v) > 0.5 ? v * 170 : 0);
      const offsets = this.offsets ?? this.measure();
      const d = (k: SheetState) => Math.abs(offsets[k] - target);
      // from the current stop, which wins a tie with one at the same offset
      this.to(this.stops().reduce((a, b) => (d(b) < d(a) ? b : a), this.state));
    };

    const onDown = (e: PointerEvent) => {
      if (!this.mobile) return;
      pid = e.pointerId;
      begin(e.clientY);
      try {
        grab.setPointerCapture(pid);
      } catch {
        /* not captureable, drag still tracks */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (pid === null || e.pointerId !== pid) return;
      track(e.clientY);
    };
    const end = (e?: PointerEvent) => {
      if (pid === null || (e && e.pointerId !== undefined && e.pointerId !== pid)) return;
      try {
        if (pid !== null) grab.releasePointerCapture(pid);
      } catch {
        /* already released */
      }
      pid = null;
      settle(true);
    };

    // A gesture on the content is a sheet drag or a native scroll for its whole
    // length, decided on its first move, before the browser commits to a pan:
    // it scrolls up only a full sheet with more to show, and down only content
    // already scrolled off its top. Anything else drags, so the host page never
    // takes it. The sheet follows past a small threshold, so taps still land.
    let ty: number | null = null,
      atTop = false,
      held = false,
      tdrag = false;
    const onTouchStart = (e: TouchEvent) => {
      const el = e.target as Element | null;
      ty =
        this.mobile && pid === null && e.touches.length === 1 && !el?.closest?.('.sheet-grab')
          ? e.touches[0].clientY
          : null;
      // under 1px, as iOS can rest a subpixel off the top
      atTop = sh.scrollTop < 1;
      held = tdrag = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (ty === null) return;
      const y = e.touches[0].clientY;
      const d = y - ty;
      if (!held) {
        const more = this.state === 'full' && sh.scrollHeight - sh.clientHeight >= 1;
        if (d < 0 ? more : !atTop) {
          ty = null;
          return;
        }
        held = true;
      }
      if (e.cancelable) e.preventDefault();
      if (!tdrag) {
        if (Math.abs(d) < 8) return;
        tdrag = true;
        begin(ty);
      }
      track(y);
    };
    const onTouchEnd = () => {
      if (ty === null) return;
      ty = null;
      if (tdrag) settle(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.to('full');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.h.isDetail() && this.state === 'half') this.h.dismiss();
        else this.to(this.state === 'full' ? 'half' : 'dock');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.h.dismiss();
      }
    };
    const onBd = () => {
      if (performance.now() < this.armAt) return;
      this.h.dismiss();
    };

    // Against the stop rather than the screen: the sheet may still be sliding
    // there, as it is when an entry's title takes focus.
    const onFocusIn = (e: FocusEvent) => {
      if (!this.mobile || !this.low()) return;
      const el = e.target as HTMLElement | null;
      if (typeof el?.getBoundingClientRect !== 'function') return;
      const top = sh.getBoundingClientRect().top;
      if (el.getBoundingClientRect().bottom - top <= this.seen(this.state)) return;
      sh.scrollTop = 0;
      this.to(this.h.isDetail() ? 'full' : 'half');
    };

    grab.addEventListener('pointerdown', onDown);
    grab.addEventListener('pointermove', onMove);
    grab.addEventListener('pointerup', end);
    grab.addEventListener('pointercancel', end);
    grab.addEventListener('keydown', onKey);
    bd.addEventListener('click', onBd);
    sh.addEventListener('focusin', onFocusIn);
    sh.addEventListener('touchstart', onTouchStart, { passive: true });
    sh.addEventListener('touchmove', onTouchMove, { passive: false });
    sh.addEventListener('touchend', onTouchEnd);
    sh.addEventListener('touchcancel', onTouchEnd);
    this.teardown.push(() => {
      grab.removeEventListener('pointerdown', onDown);
      grab.removeEventListener('pointermove', onMove);
      grab.removeEventListener('pointerup', end);
      grab.removeEventListener('pointercancel', end);
      grab.removeEventListener('keydown', onKey);
      bd.removeEventListener('click', onBd);
      sh.removeEventListener('focusin', onFocusIn);
      sh.removeEventListener('touchstart', onTouchStart);
      sh.removeEventListener('touchmove', onTouchMove);
      sh.removeEventListener('touchend', onTouchEnd);
      sh.removeEventListener('touchcancel', onTouchEnd);
    });

    let gt: ReturnType<typeof setTimeout> | null = null;
    let lastH = 0;
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (!this.mobile || sh.classList.contains('dragging')) return;
            const h = sh.offsetHeight + dockFloor.offsetHeight;
            if (Math.abs(h - lastH) < 1) return;
            lastH = h;
            if (gt) clearTimeout(gt);
            gt = setTimeout(() => this.reseat(), 60);
          });
    // the dock grows with the tally band, which a capped sheet does not show
    ro?.observe(sh);
    ro?.observe(dockFloor);
    this.teardown.push(() => {
      ro?.disconnect();
      if (gt) clearTimeout(gt);
    });

    let rt: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (rt) clearTimeout(rt);
      rt = setTimeout(() => this.to(this.state), 120);
    };
    window.addEventListener('resize', onResize);
    const unmobile = onMobileChange(() => this.to(this.stops()[0]));
    this.teardown.push(() => {
      window.removeEventListener('resize', onResize);
      unmobile();
      if (rt) clearTimeout(rt);
    });

    sh.style.transition = 'none';
    this.to('dock');
    requestAnimationFrame(() => {
      sh.style.transition = '';
    });
    this.teardown.push(onFontsReady(() => this.to(this.state)));
  }

  private reseat(): void {
    if (!this.mobile) return;
    this.slide(this.measure()[this.state]);
  }

  private slide(px: number): void {
    this.h.sidebar.style.transform = `translateY(${px}px)`;
  }

  onSectionOpened(): void {
    if (this.mobile && this.state === 'dock') this.to('half');
  }

  // A filter picked from the full sheet drops it to half, so the pins it
  // changed show, and keeps the tapped control in the part still seen.
  // Scrolled two frames on, once the sheet has re-laid out at half.
  showMap(el?: HTMLElement | null): void {
    if (!this.mobile || this.state !== 'full') return;
    this.to('half');
    if (!el) return;
    const sh = this.h.sidebar;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (this.state !== 'half' || !el.isConnected) return;
        const seen = this.seen('half');
        const head = this.h.grab.offsetHeight;
        const r = el.getBoundingClientRect();
        const top = r.top - sh.getBoundingClientRect().top;
        if (top >= head && top + r.height <= seen) return;
        const by = top + r.height / 2 - (head + seen) / 2;
        sh.scrollBy({ top: by, behavior: Sheet.scrollBehavior() });
      }),
    );
  }

  static scrollBehavior(): ScrollBehavior {
    return REDUCED.matches ? 'auto' : 'smooth';
  }

  destroy(): void {
    this.teardown.forEach((f) => f());
    this.teardown = [];
    if (this.paintTimer) clearTimeout(this.paintTimer);
  }
}
