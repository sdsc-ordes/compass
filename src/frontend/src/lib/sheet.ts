import { onFontsReady } from './fonts';
import { REDUCED } from './projection';

export type SheetState = 'dock' | 'half' | 'full' | 'peek' | 'detail';

export const MOBILE_QUERY = '(max-width:860px)';

const MOBILE: MediaQueryList =
  typeof window === 'undefined'
    ? ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      } as unknown as MediaQueryList)
    : window.matchMedia(MOBILE_QUERY);

export const isMobile = (): boolean => MOBILE.matches;

export function onMobileChange(cb: (mobile: boolean) => void): () => void {
  const handler = () => cb(MOBILE.matches);
  MOBILE.addEventListener('change', handler);
  return () => MOBILE.removeEventListener('change', handler);
}

const SHEET_HALF = 0.58;
// A peek before the pane has laid out, and the map a long title must leave.
const PEEK = 0.36;
const PEEK_MAP = 160;
// room under the title, so the peek does not end on its descenders
const PEEK_PAD = 18;
// the floor under the map a peek leaves, so the pin has somewhere to sit
const DETAIL_STRIP = 90;

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

  // An entry opens to a peek over the live map and up to the full pane;
  // pulling down from the peek dismisses it.
  private stops(): SheetState[] {
    return this.h.isDetail() ? ['peek', 'detail'] : ['dock', 'half', 'full'];
  }

  // The header, type tag and title, measured from the pane so a long title
  // gets all its lines. An unlaid-out title falls back to a share of the map.
  private peekH(H: number): number {
    const sh = this.h.sidebar;
    const r = sh.querySelector('.pane-detail h2')?.getBoundingClientRect();
    if (!r?.height) return Math.round(H * PEEK);
    const h = r.bottom - sh.getBoundingClientRect().top + sh.scrollTop + PEEK_PAD;
    return Math.round(Math.min(Math.max(H * PEEK, H - PEEK_MAP), h));
  }

  // Centres the pin in the map the peek leaves above it.
  lift(): number {
    if (!this.mobile) return 0;
    const H = this.h.stage.clientHeight;
    const box = this.h.mapc.clientHeight || window.innerHeight;
    const strip = Math.max(DETAIL_STRIP, Math.min(H, box - this.peekH(box)));
    return H / 2 - strip / 2;
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
      full: 0,
      // all the way up, the same panel the desktop rail shows
      detail: 0,
      peek: Math.max(0, sheetH - this.peekH(H)),
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
    if (stops.indexOf(state) < 0) state = this.h.isDetail() ? 'peek' : 'dock';
    const offsets = this.measure();
    this.state = state;
    sh.dataset.sheet = state;
    sh.style.transform = 'translateY(' + offsets[state] + 'px)';
    if (state === 'dock' || state === 'peek') sh.scrollTop = 0;
    // 'half' and 'peek' leave the map live above them, so filter changes show
    // on the pins and another pin can be picked.
    const shaded = state === 'full' || state === 'detail';
    bd.classList.toggle('on', shaded);
    bd.setAttribute('aria-hidden', String(!shaded));
    grab.setAttribute('aria-expanded', String(state !== 'dock' && state !== 'peek'));
    if (shaded) this.armAt = performance.now() + 400;
    if (this.paintTimer) clearTimeout(this.paintTimer);
    this.paintTimer = setTimeout(() => this.h.queue(true), 340);
  }

  toggle(): void {
    if (this.h.isDetail()) this.to(this.state === 'detail' ? 'peek' : 'detail');
    else this.to(this.state === 'full' ? 'dock' : 'full');
  }

  wire(): void {
    const { sidebar: sh, grab, backdrop: bd } = this.h;
    let pid: number | null = null,
      y0 = 0,
      off0 = 0,
      dy = 0,
      t0 = 0;

    // The drag itself, shared by the grab (pointer) and the content (touch).
    const begin = (y: number) => {
      const offsets = this.measure();
      y0 = y;
      dy = 0;
      t0 = performance.now();
      off0 = offsets[this.state] !== undefined ? offsets[this.state] : offsets.dock;
      sh.classList.add('dragging');
    };
    const track = (y: number) => {
      if (!this.offsets) return;
      dy = y - y0;
      const floor = this.h.isDetail() ? this.offsets.peek + 150 : this.offsets.dock + 40;
      sh.style.transform = 'translateY(' + Math.max(-28, Math.min(floor, off0 + dy)) + 'px)';
    };
    const settle = (tap: boolean) => {
      sh.classList.remove('dragging');
      const v = dy / Math.max(1, performance.now() - t0);
      if (tap && Math.abs(dy) < 6) {
        this.toggle();
        return;
      }
      // An entry steps one stop per swipe, and off the bottom from the peek.
      if (this.h.isDetail()) {
        if (dy > 60 || v > 0.45) {
          if (this.state === 'peek') this.h.dismiss();
          else this.to('peek');
        } else this.to(dy < -60 || v < -0.45 ? 'detail' : this.state);
        return;
      }
      const target = off0 + dy + (Math.abs(v) > 0.5 ? v * 170 : 0);
      const offsets = this.offsets ?? this.measure();
      let best: SheetState = this.stops()[0],
        bestD = Infinity;
      this.stops().forEach((k) => {
        const d = Math.abs(offsets[k] - target);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      });
      this.to(best);
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

    // The content takes over from native scrolling only for a pull down from
    // the top, or any pull up while docked or peeking (nothing to scroll there). Decided
    // past a small threshold, so taps on buttons and links still land.
    let ty: number | null = null,
      tdrag = false;
    const onTouchStart = (e: TouchEvent) => {
      const el = e.target as Element | null;
      ty =
        this.mobile && pid === null && e.touches.length === 1 && !el?.closest?.('.sheet-grab')
          ? e.touches[0].clientY
          : null;
      tdrag = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (ty === null) return;
      const y = e.touches[0].clientY;
      if (!tdrag) {
        const d = y - ty;
        if (Math.abs(d) < 8) return;
        const low = this.state === 'dock' || this.state === 'peek';
        if (!((d > 0 && sh.scrollTop <= 0) || (d < 0 && low))) {
          ty = null;
          return;
        }
        tdrag = true;
        begin(ty);
      }
      if (e.cancelable) e.preventDefault();
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
        this.to(this.h.isDetail() ? 'detail' : 'full');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.state === 'peek') this.h.dismiss();
        else if (this.state === 'detail') this.to('peek');
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
      if (!this.mobile || (this.state !== 'dock' && this.state !== 'peek')) return;
      const el = e.target as HTMLElement | null;
      if (typeof el?.getBoundingClientRect !== 'function') return;
      const seen = sh.offsetHeight - (this.offsets ?? this.measure())[this.state];
      if (el.getBoundingClientRect().bottom - sh.getBoundingClientRect().top <= seen) return;
      sh.scrollTop = 0;
      this.to(this.state === 'peek' ? 'detail' : 'half');
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
            const h = sh.offsetHeight;
            if (Math.abs(h - lastH) < 1) return;
            lastH = h;
            if (gt) clearTimeout(gt);
            gt = setTimeout(() => this.reseat(), 60);
          });
    ro?.observe(sh);
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
    const unmobile = onMobileChange(() => this.to(this.h.isDetail() ? 'peek' : 'dock'));
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

  reseat(): void {
    if (!this.mobile) return;
    const offsets = this.measure();
    this.h.sidebar.style.transform = 'translateY(' + offsets[this.state] + 'px)';
  }

  onSectionOpened(): void {
    if (this.mobile && this.state === 'dock') this.to('half');
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
