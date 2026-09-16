import { onFontsReady } from './fonts';
import { REDUCED } from './projection';

export type SheetState = 'dock' | 'half' | 'full' | 'detail';

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
const SHEET_DETAIL = 0.68;

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

  private stops(): SheetState[] {
    return this.h.isDetail() ? ['detail', 'full'] : ['dock', 'half', 'full'];
  }

  lift(): number {
    if (!this.mobile) return 0;
    const H = this.h.stage.clientHeight;
    const box = this.h.mapc.clientHeight || window.innerHeight;
    const strip = Math.max(90, Math.min(H, box - Math.round(box * SHEET_DETAIL)));
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
      detail: Math.max(0, sheetH - Math.round(H * SHEET_DETAIL)),
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
    if (stops.indexOf(state) < 0) state = this.h.isDetail() ? 'detail' : 'dock';
    const offsets = this.measure();
    this.state = state;
    sh.dataset.sheet = state;
    sh.style.transform = 'translateY(' + offsets[state] + 'px)';
    if (state === 'dock') sh.scrollTop = 0;
    const shaded = state !== 'dock';
    bd.classList.toggle('on', shaded);
    bd.setAttribute('aria-hidden', String(!shaded));
    grab.setAttribute('aria-expanded', String(state !== 'dock'));
    if (shaded) this.armAt = performance.now() + 400;
    if (this.paintTimer) clearTimeout(this.paintTimer);
    this.paintTimer = setTimeout(() => this.h.queue(true), 340);
  }

  toggle(): void {
    if (this.h.isDetail()) {
      this.to(this.state === 'detail' ? 'full' : 'detail');
      return;
    }
    this.to(this.state === 'full' ? 'dock' : 'full');
  }

  wire(): void {
    const { sidebar: sh, grab, backdrop: bd } = this.h;
    let pid: number | null = null,
      y0 = 0,
      off0 = 0,
      dy = 0,
      t0 = 0;

    const onDown = (e: PointerEvent) => {
      if (!this.mobile) return;
      const offsets = this.measure();
      pid = e.pointerId;
      y0 = e.clientY;
      dy = 0;
      t0 = performance.now();
      off0 = offsets[this.state] !== undefined ? offsets[this.state] : offsets.dock;
      sh.classList.add('dragging');
      try {
        grab.setPointerCapture(pid);
      } catch {
        /* not captureable, drag still tracks */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (pid === null || e.pointerId !== pid || !this.offsets) return;
      dy = e.clientY - y0;
      const floor = this.h.isDetail() ? this.offsets.detail + 150 : this.offsets.dock + 40;
      sh.style.transform = 'translateY(' + Math.max(-28, Math.min(floor, off0 + dy)) + 'px)';
    };
    const end = (e?: PointerEvent) => {
      if (pid === null || (e && e.pointerId !== undefined && e.pointerId !== pid)) return;
      try {
        if (pid !== null) grab.releasePointerCapture(pid);
      } catch {
        /* already released */
      }
      pid = null;
      sh.classList.remove('dragging');
      const v = dy / Math.max(1, performance.now() - t0);
      if (Math.abs(dy) < 6) {
        this.toggle();
        return;
      }
      if (this.h.isDetail() && (dy > 80 || v > 0.45)) {
        this.h.dismiss();
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.to('full');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.to(this.h.isDetail() ? 'detail' : this.state === 'full' ? 'half' : 'dock');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.h.dismiss();
      }
    };
    const onBd = () => {
      if (performance.now() < this.armAt) return;
      this.h.dismiss();
    };

    const onFocusIn = (e: FocusEvent) => {
      if (!this.mobile || this.state !== 'dock') return;
      const el = e.target as HTMLElement | null;
      if (typeof el?.getBoundingClientRect !== 'function') return;
      if (el.getBoundingClientRect().bottom <= this.h.mapc.getBoundingClientRect().bottom)
        return;
      sh.scrollTop = 0;
      this.to('half');
    };

    grab.addEventListener('pointerdown', onDown);
    grab.addEventListener('pointermove', onMove);
    grab.addEventListener('pointerup', end);
    grab.addEventListener('pointercancel', end);
    grab.addEventListener('keydown', onKey);
    bd.addEventListener('click', onBd);
    sh.addEventListener('focusin', onFocusIn);
    this.teardown.push(() => {
      grab.removeEventListener('pointerdown', onDown);
      grab.removeEventListener('pointermove', onMove);
      grab.removeEventListener('pointerup', end);
      grab.removeEventListener('pointercancel', end);
      grab.removeEventListener('keydown', onKey);
      bd.removeEventListener('click', onBd);
      sh.removeEventListener('focusin', onFocusIn);
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
    const unmobile = onMobileChange(() => this.to(this.h.isDetail() ? 'detail' : 'dock'));
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
