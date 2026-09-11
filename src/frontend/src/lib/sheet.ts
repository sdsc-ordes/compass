/**
 * Mobile — the filters dock below the map and the entry detail takes the same
 * panel over.
 *
 * The panel has three stops as filters (dock, half, full) and one as a detail
 * pane. "dock" is the floor: the handle and the tally are on screen at every
 * stop, so the count of what the filters left standing is never clicked away to
 * nothing. Only --dock sizes the stage, so sliding the panel never re-fits the
 * map.
 *
 * The dock used to show the tab strip instead of the tally, because the strip was
 * one line tall and put all the dimensions a tap away. The accordion that
 * replaced it is five stacked headers, ~220px, which would have eaten the map —
 * so the floor is the handle plus the tally, the panel's one line of standing
 * information, and the dimensions are reached by opening the panel.
 */
import { onFontsReady } from './fonts';
import { REDUCED } from './projection';

export type SheetState = 'dock' | 'half' | 'full' | 'detail';

/** The one breakpoint the panel exists at. Must match styles/mobile.css. */
export const MOBILE_QUERY = '(max-width:860px)';

/* One MediaQueryList for the whole widget. Three places used to ask the browser
   for this same query and keep their own listener on it. */
const MOBILE: MediaQueryList =
  typeof window === 'undefined'
    ? ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      } as unknown as MediaQueryList)
    : window.matchMedia(MOBILE_QUERY);

/** True while the panel docks below the map rather than sitting beside it. */
export const isMobile = (): boolean => MOBILE.matches;

/** Subscribes to breakpoint crossings; the return value unsubscribes. */
export function onMobileChange(cb: (mobile: boolean) => void): () => void {
  const handler = () => cb(MOBILE.matches);
  MOBILE.addEventListener('change', handler);
  return () => MOBILE.removeEventListener('change', handler);
}

const SHEET_HALF = 0.58; /* the middle stop, as a share of the viewport */
const SHEET_DETAIL = 0.68; /* the stop a selected entry opens at */

export interface SheetHost {
  mapc: HTMLElement;
  sidebar: HTMLElement;
  grab: HTMLElement;
  backdrop: HTMLElement;
  /** The one block that must stay on screen at the dock stop. Its height plus the
      handle's is --dock, so what is passed here IS the decision about how much
      map the docked panel is allowed to cover. */
  dockFloor: HTMLElement;
  stage: HTMLElement;
  /** True while the detail pane has the panel. */
  isDetail: () => boolean;
  /** Repaint the map once the slide has landed. */
  queue: (full?: boolean) => void;
  /** One way out of an entry, wherever it is asked for. */
  dismiss: () => void;
  /** Mirrors the state back so the component can render aria-expanded etc. */
  onState: (s: SheetState) => void;
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

  /** How far the map's centre must rise for a selected entry to clear the panel.
      Zero on desktop, where the panel does not exist. */
  lift(): number {
    if (!this.mobile) return 0;
    const H = this.h.stage.clientHeight;
    const box = this.h.mapc.clientHeight || window.innerHeight;
    const strip = Math.max(90, Math.min(H, box - Math.round(box * SHEET_DETAIL)));
    return H / 2 - strip / 2;
  }

  /** Stops are translateY offsets from the panel's resting place, so a drag is one
      number. The dock height is measured, the rest are shares of the viewport. */
  measure(): Record<SheetState, number> {
    const { sidebar: sh, grab, mapc, dockFloor } = this.h;
    const H = mapc.clientHeight || window.innerHeight;
    const sheetH = sh.offsetHeight;
    const grabH = grab.offsetHeight || 58;
    /* The floor measures 0 while the detail pane has the panel — it lives inside
       .pane-filters, which is display:none there — so the last good dock height
       stands, otherwise opening an entry would resize the dock. */
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
    /* Not interchangeable: a detail pane has nothing to show at dock height. */
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
    /* A tap on a pin puts the backdrop under the very finger that opened it, and a
     touch is followed by a synthetic click — so it is armed a beat later. */
    if (shaded) this.armAt = performance.now() + 400;
    /* Names dodge the panel, so repaint once the slide lands, not every frame. */
    if (this.paintTimer) clearTimeout(this.paintTimer);
    this.paintTimer = setTimeout(() => this.h.queue(true), 340);
    this.h.onState(state);
  }

  /** A tap opens the panel the whole way, a second puts it back: a three-stop
      cycle meant the first tap stopped somewhere nobody asked for. */
  toggle(): void {
    if (this.h.isDetail()) {
      this.to(this.state === 'detail' ? 'full' : 'detail');
      return;
    }
    this.to(this.state === 'full' ? 'dock' : 'full');
  }

  /** The drag lives on the handle alone, so the panel body keeps its scrolling and
      the controls inside keep their own gestures. */
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
      /* A little give past either end, more downward while an entry is open, because
       pulling down is how it is put away. */
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
      const v = dy / Math.max(1, performance.now() - t0); /* px/ms, + is downward */
      /* Under a few pixels the gesture was a tap on the handle, not a drag. */
      if (Math.abs(dy) < 6) {
        this.toggle();
        return;
      }
      /* Pulling the detail panel down is how an entry is put away. */
      if (this.h.isDetail() && (dy > 80 || v > 0.45)) {
        this.h.dismiss();
        return;
      }
      /* A flick is answered by where it was heading, not where it let go. */
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
    /* Behind the backdrop is either an entry to put away or a panel to re-dock;
       dismiss() is both, since it is a no-op when nothing is selected. */
    const onBd = () => {
      if (performance.now() < this.armAt) return;
      this.h.dismiss();
    };

    /**
     * Raises the panel when focus lands on something the dock is clipping.
     *
     * The dock stop shows the handle and the tally, and everything under them —
     * the accordion's five headers, and every option row — is still in the tab
     * order while being off screen, so tabbing on from the reset button used to
     * put the caret somewhere invisible (WCAG 2.4.7). It mattered less when the
     * dock showed the tab strip, since the strip WAS the first thing below the
     * handle; the accordion is too tall for that, so the panel comes up instead.
     *
     * The panel's visible strip ends at the widget's own bottom edge, so a rect
     * reaching past that is clipped. scrollTop is put back first because the
     * browser answers a focus inside an overflow:hidden box by scrolling that box
     * — which at the dock would carry the tally off the top of the strip.
     */
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

    /* The stops are pixels, so anything that changes the viewport recomputes them
       and re-lands on the stop the panel was already at. */
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

    /* Resting place is CSS, the exact stop is measured: the transition is suppressed
     for the one frame between them. */
    sh.style.transition = 'none';
    this.to('dock');
    requestAnimationFrame(() => {
      sh.style.transition = '';
    });
    /* Dock height is the handle plus the tally, whose height follows the metrics
       of the face the reset button ends up in — so it is measured after fonts. */
    this.teardown.push(onFontsReady(() => this.to(this.state)));
  }

  /** Opening a dimension's section asks for room to read its options, so the
      panel comes up with it. */
  onSectionOpened(): void {
    if (this.mobile && this.state === 'dock') this.to('half');
  }

  /** Smooth scrolling, unless the visitor has asked for less motion. */
  static scrollBehavior(): ScrollBehavior {
    return REDUCED.matches ? 'auto' : 'smooth';
  }

  destroy(): void {
    this.teardown.forEach((f) => f());
    this.teardown = [];
    if (this.paintTimer) clearTimeout(this.paintTimer);
  }
}
