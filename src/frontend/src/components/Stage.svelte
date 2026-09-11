<script lang="ts">
  /**
   * The stage: SVG basemap, canvas pins, HTML place names, the two map cards and
   * the control chrome.
   */
  import { onMount, onDestroy } from 'svelte';
  import { geoDistance } from 'd3-geo';
  import type { GeoProjection } from 'd3-geo';
  import { P } from '../lib/palette';
  import {
    proj,
    initialView,
    centreLonLat,
    flatOffsetFor,
    frontCentre,
    bindInput,
    fitScale,
    onSchemeChange,
    prefersDark,
    Tweener,
    REDUCED,
    K_MIN,
    K_MAX,
    type ViewState,
  } from '../lib/projection';
  import { loadAtlas, renderBasemap, type Atlas } from '../lib/basemap';
  import { atMaxZoom, drawPins, hitPin, boxFor, onFront, PinAnimator } from '../lib/pins';
  import { onFontsReady } from '../lib/fonts';
  import { placeLabels } from '../lib/labels';
  import { CardLayer } from '../lib/cards';
  import { entityLabel, isCluster, type PinBox, type PinTarget, type Proj } from '../lib/types';
  import Basemap from './Basemap.svelte';
  import PinNav from './PinNav.svelte';
  import MapCard from './MapCard.svelte';
  import StageChrome from './StageChrome.svelte';
  import Coach from './Coach.svelte';
  import { fmt, type Strings } from '../lib/i18n';

  export let t: Strings;
  /** Everything the filters leave standing. Regions never reach here — see CompassMap. */
  export let projs: Proj[] = [];
  export let selected: Proj | null = null;
  /** The stage never owns the selection; it asks for one and reacts to the answer. */
  export let onSelect: (p: Proj | null) => void;
  /** Mirrors the theme up so .mapc can carry .night for the sidebar's chrome. */
  export let onTheme: (night: boolean) => void = () => {};
  /** The collapsed-sidebar opener lives on the stage; its words come from outside. */
  export let openerLabel = '';
  export let onOpen: () => void = () => {};
  /** How far a selected entry has to rise to clear the mobile detail panel. */
  export let lift: () => number = () => 0;
  /** The mobile panel, so place names can dodge it. */
  export let sheetEl: HTMLElement | null = null;
  export let isMobile: () => boolean = () => false;
  /**
   * The width the stage will have once the sidebar's transition finishes, or 0
   * for "same as now".
   *
   * Clicking a pin while the sidebar is collapsed re-opens it, and the stage is
   * still full-width for the whole 520ms that takes. Aiming at the live width
   * parked the entry half a panel off centre, so the flight aims at the geometry
   * it is going to land in and the two motions run as one.
   */
  export let settledWidth: () => number = () => 0;
  /** Set while the engine is querying, so the empty plate does not flash. */
  export let loading = false;
  /** A query or engine failure, already worded and localized by CompassMap. The
      stage shows it, because a blank basemap otherwise reads as "nothing matched". */
  export let error: string | null = null;
  /** The language segmented control the design does not have — see the markup. */
  export let lang: 'en' | 'de' = 'en';
  export let onLang: (l: 'en' | 'de') => void = () => {};

  /* ---------- view state ---------- */
  const S: ViewState = initialView();
  let atlas: Atlas | null = null;
  let interact = false;
  let qid: ReturnType<typeof setTimeout> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let hovered: PinTarget | null = null;
  let pinbox: PinBox[] = [];

  /* ---------- the fan ----------
     At max zoom the map has nothing left to separate with, so any disc still
     holding two or more members spreads them instead of advising a zoom that
     cannot happen. That is the whole rule; there is no state to hold beyond the
     openness `anim` eases, and no interaction — the fan is a function of the
     zoom level.

     It replaced a coordinate-purity test, which was the bug: a group of
     coincident pins that had merged with any neighbour within CLUSTER_R + 8
     stopped counting as coincident and silently never fanned. `fanned` here only
     remembers what we last told `anim`, so crossing the threshold is asked for
     once rather than on every repaint. */
  let fanned = false;

  function syncFan(): void {
    const want = atMaxZoom(S);
    if (want === fanned) return;
    fanned = want;
    anim.setFan(want);
  }

  /* ---------- the first-load coach ----------
     Shown once per page load, a beat after the first query answers, and only if
     the visitor has not already started using the map. There is no idle re-show
     and no second chance: one demonstration, then the map is theirs.

     `coachDone` and `coachTimer` are plain variables that NO reactive statement
     reads. That is the point: a `$:` block which both reads and assigns its own
     guard re-dirties itself and spins forever inside one flush — which is exactly
     how the story-count debounce broke once (see Stories.schedule). So the arming
     happens in armCoach() below, and the only `$:` involved reads props it never
     writes. */
  const COACH_DELAY = 3000;
  let coachOn = false;
  let coachDone = false;
  let coachTimer: ReturnType<typeof setTimeout> | null = null;

  /** Arms the coach the first time a query answers cleanly. Idempotent. */
  function armCoach(ready: boolean): void {
    if (coachDone || !ready) return;
    coachDone = true;
    coachTimer = setTimeout(() => {
      coachTimer = null;
      /* Re-tested at fire time, not just at arm time. Three seconds is long
         enough for a filter to have emptied the map or an entry to have been
         opened, and the coach must not land on top of the empty plate — both of
         them sit in the middle of the stage. */
      if (!selected && !error && projs.length > 0) coachOn = true;
    }, COACH_DELAY);
  }

  /** Any deliberate move on the map, or an entry opening, and it has done its
      job. Also stops it arming at all if the visitor got in first. */
  function cancelCoach(): void {
    coachDone = true;
    if (coachTimer) {
      clearTimeout(coachTimer);
      coachTimer = null;
    }
    if (coachOn) coachOn = false;
  }

  /* Reads `loading`, `error` and `projs`, assigns none of them — armCoach keeps
     its own guard. The trigger is the first query ANSWERING, not first paint: the
     loading plate is up for as long as the wasm engine takes to boot, and the
     coach would otherwise be drawn straight on top of it. */
  $: armCoach(!loading && !error && projs.length > 0);

  /* Chrome that Svelte renders rather than the canvas.

     viewMode and night mirror S.view and S.theme on purpose, and the two are
     DELIBERATELY allowed to disagree: S is a plain object Svelte does not track,
     so the switches need a reactive copy — and setMode/setTheme
     assign the copy at once but only assign S under the fade, 120-140ms later.
     That is what makes a pressed switch answer instantly while the map it
     describes crossfades. Collapsing them into one value re-introduces the lag. */
  let viewMode: 'flat' | 'globe' = 'flat';
  /* Opens on the system's scheme — same source as initialView()'s S.theme, so the
     switch and the map agree from the first frame. */
  let night = prefersDark();
  /**
   * Set the moment the switch is used, and never cleared.
   *
   * After that the system is no longer consulted: a visitor who asked for light
   * on a dark desktop must not be flipped back the next time the system changes,
   * which would read as the switch having failed.
   */
  let themePinned = false;

  /* ---------- element refs ---------- */
  let stage: HTMLDivElement;
  let cv: HTMLCanvasElement;
  let ov: HTMLDivElement;
  let basemap: Basemap;
  let cardEl: HTMLDivElement;
  let prevEl: HTMLDivElement;
  let attribEl: HTMLDivElement;
  let emptyEl: HTMLDivElement;
  let loadEl: HTMLDivElement;
  let errEl: HTMLDivElement;
  let zoomEl: HTMLDivElement;
  /** The settings panel, only while it is open — see keepOut(). */
  let panelEl: HTMLDivElement | null = null;

  /* The two cards' visibility, which is all sequencing — see CardLayer. Getters,
     because Svelte assigns bind:this after this line runs and nulls it on destroy. */
  const cards = new CardLayer({ preview: () => prevEl, card: () => cardEl });

  /* ---------- painting ---------- */
  const anim = new PinAnimator(() => paintPins());
  const tween = new Tweener(
    S,
    (full?: boolean) => queue(full),
    (on) => {
      interact = on;
    },
  );

  function queue(full?: boolean): void {
    if (!S.ready) return;
    if (qid) return;
    const ms = interact && !full ? 36 : 0;
    qid = setTimeout(() => {
      qid = null;
      /* Every zoom — wheel, buttons, tween, reset, a cluster click — ends up
         here, so this is the one place the fan has to be asked about. */
      syncFan();
      renderAll();
    }, ms);
  }

  /** Everything: basemap, place names and pins. Debounced — the names cost a
      measure-and-place pass of ~200ms. */
  function renderAll(): void {
    if (!atlas || !stage) return;
    const W = stage.clientWidth,
      H = stage.clientHeight;
    if (!W || !H) {
      /* Laid out at zero: nothing can be measured yet, so come back for it. */
      if (retry) clearTimeout(retry);
      retry = setTimeout(() => queue(true), 80);
      return;
    }
    renderBasemap(basemap.refs(), S, W, H, atlas);
    const pr = paintCanvas(W, H);
    if (!pr) return;
    /* Skipped while a hand is on the map, rebuilt once it lets go. */
    if (!interact) runLabels(pr, W, H);
    else ov.textContent = '';
  }

  /** The canvas layer alone — pins and the two cards that follow them. */
  function paintPins(): void {
    if (!stage || !cv) return;
    const W = stage.clientWidth,
      H = stage.clientHeight;
    if (W && H) paintCanvas(W, H);
  }

  /** Redraws the pins and re-places the cards. Returns the projection it drew
      with, so a caller does not build a second one. Null before the atlas lands. */
  function paintCanvas(W: number, H: number): GeoProjection | null {
    /* Capped at 2, and re-sized only on change: assigning width clears the canvas. */
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== W * dpr || cv.height !== H * dpr) {
      cv.width = W * dpr;
      cv.height = H * dpr;
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const pr = proj(S, W, H);
    pinbox = drawPins({
      ctx,
      pr,
      W,
      H,
      p: P[S.theme],
      S,
      anim,
      visible: projs,
      selected,
      cardShowing: cardShowing(),
      touch: isMobile(),
      clusterLabel: (n) => ({ title: fmt(t.clusterTitle, { n }), where: t.clusterWhere }),
    });
    syncPinPreview();
    positionProjectCard();
    return pr;
  }

  /** Re-reads the roster and eases every pin toward its new emphasis and fade. */
  function pumpPins(list: Proj[] = projs): void {
    if (!S.ready) return;
    anim.pump(list, selected?.id ?? null, hovered?.id ?? null);
  }

  /** The stage chrome place names may not be put on top of. */
  function keepOut(): { x: number; y: number; w: number; h: number }[] {
    const sr = stage.getBoundingClientRect();
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    const add = (el: Element | null, padW: number, padH: number) => {
      if (!el) return;
      if (getComputedStyle(el).display === 'none') return;
      const r = el.getBoundingClientRect();
      if (!r.width) return;
      boxes.push({
        x: r.left - sr.left + r.width / 2,
        y: r.top - sr.top + r.height / 2,
        w: r.width + padW,
        h: r.height + padH,
      });
    };
    /* The coach animation is deliberately absent — see .coach in chrome.css. */
    [attribEl, emptyEl, loadEl, errEl].forEach((el) => add(el, 40, 16));
    /* One cluster now, so its rect already covers the settings button; the panel
       is absolutely positioned and outside that rect, so it is measured apart. */
    [zoomEl, panelEl].forEach((el) => add(el, 30, 20));
    /* On mobile the panel covers map, so it is one more place a name may not go. */
    if (isMobile() && sheetEl) {
      const sb = sheetEl.getBoundingClientRect();
      if (sb.width) {
        boxes.push({
          x: sb.left - sr.left + sb.width / 2,
          y: sb.top - sr.top + sb.height / 2,
          w: sb.width + 20,
          h: sb.height + 16,
        });
      }
    }
    return boxes;
  }

  function runLabels(pr: GeoProjection, W: number, H: number): void {
    const ctx = cv.getContext('2d');
    if (!ctx || !atlas) return;
    placeLabels({
      pr,
      W,
      H,
      p: P[S.theme],
      S,
      ov,
      pinbox,
      keepOut: keepOut(),
      measureCtx: ctx,
      cty: atlas.cty,
    });
  }

  /* ---------- zoom ---------- */
  function zoomTo(k: number, mx: number, my: number): void {
    k = Math.max(K_MIN, Math.min(K_MAX, k));
    if (S.view === 'flat') {
      const g = k / S.k;
      S.tx = mx - g * (mx - S.tx);
      S.ty = my - g * (my - S.ty);
    }
    S.k = k;
    queue();
  }

  /** A button press eases; the wheel stays direct, the hand supplies the motion. */
  function zoomStep(f: number): void {
    const k = Math.max(K_MIN, Math.min(K_MAX, S.k * f));
    if (k === S.k) return;
    const mx = stage.clientWidth / 2,
      my = stage.clientHeight / 2,
      g = k / S.k;
    if (S.view === 'flat')
      tween.to({ k, tx: mx - g * (mx - S.tx), ty: my - g * (my - S.ty) }, 280);
    else tween.to({ k }, 280);
  }

  function resetView(): void {
    tween.to({ k: 1, tx: 0, ty: 0, rot: [-18, -8] }, 420);
  }

  /* ---------- mode and theme ---------- */
  /**
   * Projection and theme swaps cannot be tweened — a sphere does not ease into a
   * flat map — so both are covered by a short fade instead.
   */
  let fade: ReturnType<typeof setTimeout> | null = null;

  function underFade(ms: number, apply: () => void): void {
    if (REDUCED.matches) {
      apply();
      return;
    }
    stage.classList.add('swapping');
    /* Cleared on destroy: Svelte nulls bind:this, so a widget removed mid-fade
     would land here with no stage to un-fade. */
    if (fade) clearTimeout(fade);
    fade = setTimeout(() => {
      fade = null;
      apply();
      stage.classList.remove('swapping');
    }, ms);
  }

  /** The swap keeps whatever was under the middle of the stage under it. */
  function setMode(m: 'flat' | 'globe'): void {
    if (m === S.view) return;
    tween.stop();
    const W = stage.clientWidth,
      H = stage.clientHeight;
    const c = centreLonLat(S, W, H);
    viewMode = m;
    underFade(140, () => {
      S.view = m;
      if (m === 'globe') {
        S.rot = [-c[0], -c[1]];
        S.tx = 0;
        S.ty = 0;
      } else Object.assign(S, flatOffsetFor(S, W, H, c));
      queue(true);
    });
  }

  /** `pin` is what the switch does and a system change does not — see themePinned. */
  function setTheme(dark: boolean, pin = true): void {
    if (pin) themePinned = true;
    if (dark === night) return;
    night = dark;
    onTheme(dark);
    underFade(120, () => {
      S.theme = dark ? 'dark' : 'light';
      queue(true);
      pumpPins();
    });
  }

  /* ---------- hover preview ---------- */
  function positionPinPreview(): void {
    cards.preview(hovered ? boxFor(pinbox, hovered.id) : undefined, stage.clientWidth);
  }

  /** Re-checks the hover after a repaint, which can have moved or dropped it. */
  function syncPinPreview(): void {
    if (!hovered) return;
    /* Gone from the results — a filter excluded it — so the hover goes with it. */
    if (!isCluster(hovered) && !projs.some((d) => d.id === hovered!.id)) {
      setHover(null);
      return;
    }
    /* Not drawn. While the view is moving the pin may still be flying in — a twin's
       focus flies to its pin — so keep the hover and wait for the next frame. */
    if (!boxFor(pinbox, hovered.id)) {
      if (!interact) setHover(null);
      else positionPinPreview();
      return;
    }
    positionPinPreview();
  }

  function setHover(p: PinTarget | null): void {
    if (hovered === p) {
      if (p) positionPinPreview();
      return;
    }
    hovered = p;
    if (!p) {
      cards.closePreview();
      stage.style.cursor = 'crosshair';
      pumpPins();
      return;
    }
    stage.style.cursor = 'pointer';
    /* Unhidden now, placed next frame, so the fade has a start state. */
    cards.openPreview();
    requestAnimationFrame(positionPinPreview);
    pumpPins();
  }

  /** The pin under a pointer, in client coordinates. */
  function pinAt(e: PointerEvent): PinTarget | null {
    const r = stage.getBoundingClientRect();
    return hitPin(pinbox, e.clientX - r.left, e.clientY - r.top);
  }

  function hoverAt(e: PointerEvent): void {
    setHover(pinAt(e));
  }

  function clickAt(e: PointerEvent): void {
    const hit = pinAt(e);
    /* Bare map is the gesture for putting an entry away — which is why the chrome
       stops its own events reaching here. */
    if (!hit) {
      onSelect(null);
      return;
    }
    /* Every disc left on screen is one zoom can still break apart: at max zoom
       there are no discs, only fans. So a cluster click is always a zoom. */
    if (isCluster(hit)) {
      zoomIntoCluster(hit.id, hit.c);
      return;
    }
    onSelect(hit);
  }

  /** A twin flies its pin into view. At max zoom that pin is already fanned out
      on its own, so the keyboard lands on the entity rather than on a disc. */
  function onTwinFocus(d: Proj): void {
    flyTo(d);
    setHover(d);
  }

  function zoomIntoCluster(id: string, c: [number, number]): void {
    const box = pinbox.find((b) => b.p.id === id);
    const k = Math.min(K_MAX, S.k * 2.2);
    setHover(null);
    if (S.view === 'globe') {
      tween.to({ k, rot: [-c[0], -c[1]] }, 520);
      return;
    }
    const g = k / S.k;
    const mx = box ? box.x : stage.clientWidth / 2,
      my = box ? box.y : stage.clientHeight / 2;
    tween.to({ k, tx: mx - g * (mx - S.tx), ty: my - g * (my - S.ty) }, 520);
  }

  /* ---------- the close-range card ---------- */
  const DETAIL_K = 3.4;
  /** Below this the card would crowd its neighbours, so the pin comes back instead. */
  const CARD_K = 2.2;

  const cardShowing = () => !!selected && S.k >= CARD_K;

  /** At close range the selected entry stops being a marker and states what it is. */
  function positionProjectCard(): void {
    if (!selected || S.k < CARD_K || !onFront(S, selected.c)) {
      cards.closeEntry();
      return;
    }
    const W = stage.clientWidth,
      H = stage.clientHeight;
    cards.entry(proj(S, W, H)(selected.c), W);
  }

  /** Travels to an entry and settles where its surroundings read. Never zooms out. */
  /* ---------- keeping the map still when the stage changes size ---------- */
  let lastW = 0;
  let lastH = 0;

  /**
   * Divides out the projection's dependence on the stage's size.
   *
   * proj() re-fits the map to the stage on every paint, so the basis scale moves
   * with the width: opening the 420px sidebar on a 1400px frame drops it 30%, and
   * the map appears to zoom out on its own. This multiplies S.k by exactly the
   * reciprocal and re-centres, so a resize reframes the map without zooming it.
   *
   * Exported because the order matters. CompassMap calls it after un-collapsing
   * and before setting the selection, so the flight starts from a compensated
   * view rather than being handed a 30% rescale halfway through.
   *
   * Two guards, both load-bearing:
   *  - Skipped while a tween runs. A flight has already aimed at the settled
   *    geometry, so compensating under it would fight its targets.
   *  - Skipped if the compensated k would leave [K_MIN, K_MAX]. Clamping instead
   *    would silently trip atMaxZoom() and fan every pileup on the stage just
   *    because a panel opened.
   */
  export function absorbResize(): void {
    if (!stage || !S.ready) return;
    const W = stage.clientWidth,
      H = stage.clientHeight;
    if (!W || !H) return;
    /* First sighting: record, do not compensate — there is no "before". */
    if (!lastW || !lastH) {
      lastW = W;
      lastH = H;
      return;
    }
    if (W === lastW && H === lastH) return;
    if (S.view === 'flat' && !tween.running) {
      const want = S.k * (fitScale(lastW, lastH) / fitScale(W, H));
      if (want >= K_MIN && want <= K_MAX) {
        const c = centreLonLat(S, lastW, lastH);
        S.k = want;
        Object.assign(S, flatOffsetFor(S, W, H, c, want));
      }
    }
    lastW = W;
    lastH = H;
  }

  /* Matches the sidebar's width transition in styles/sidebar.css to the
     millisecond, and Tweener's ease matches its curve. The two have to move
     together or opening a collapsed panel reads as two separate animations. */
  const ENTRY_MS = 520;

  function zoomToProject(p: Proj): void {
    const k = Math.max(S.k, DETAIL_K);
    if (S.view === 'globe') {
      tween.to({ k, rot: [-p.c[0], -p.c[1]] }, ENTRY_MS);
      return;
    }
    /* The width it will settle at, not the one it has: the sidebar may be on its
       way in underneath this very flight. */
    const W = settledWidth() || stage.clientWidth;
    const o = flatOffsetFor(S, W, stage.clientHeight, p.c, k);
    /* The middle of the stage is behind the mobile panel, so park the entry in the
       strip of map the panel leaves standing. */
    tween.to({ k, tx: o.tx, ty: o.ty - lift() }, ENTRY_MS);
  }

  /** Brings an entry into view only when it is not already on screen. */
  function flyTo(p: Proj): void {
    const W = stage.clientWidth,
      H = stage.clientHeight;
    if (S.view === 'globe') {
      if (geoDistance(p.c, frontCentre(S)) < 1.0) return;
      tween.to({ rot: [-p.c[0], -p.c[1]] }, 620);
      return;
    }
    const xy = proj(S, W, H)(p.c);
    if (
      xy &&
      isFinite(xy[0]) &&
      xy[0] > W * 0.2 &&
      xy[0] < W * 0.8 &&
      xy[1] > H * 0.2 &&
      xy[1] < H * 0.8
    )
      return;
    const o = flatOffsetFor(S, W, H, p.c);
    tween.to({ tx: o.tx, ty: o.ty }, 620);
  }

  /* A filter change can orphan a selection just as a click can make one. */
  let lastSelectedId: string | null = null;
  $: if (S.ready && (selected?.id ?? null) !== lastSelectedId) {
    lastSelectedId = selected?.id ?? null;
    onSelectionChanged(selected);
  }

  function onSelectionChanged(p: Proj | null): void {
    setHover(null);
    if (p) {
      /* Opening an entry is the map being used, coach or no coach. */
      cancelCoach();
      zoomToProject(p);
    } else {
      cards.closeEntry();
      /* Putting an entry away leaves the map exactly where it is. It used to
         travel back to a view snapshotted when the entry opened, which read as
         the map wandering off on its own — the visitor had usually panned or
         zoomed while reading, and that work was silently undone.

         The stop matters: zoomToProject runs for 680ms, so dismissing an entry
         while it is still flying would otherwise keep the map gliding towards
         the entry that was just dismissed. */
      tween.stop();
      queue();
    }
    queue();
    pumpPins();
  }

  /* Passed as an argument, not left to the default: a statement depends only on
     what its own body reads. */
  $: pumpPins(projs);

  /* ---------- boot ---------- */
  let unbind: (() => void) | null = null;
  let unfonts: (() => void) | null = null;
  let unscheme: (() => void) | null = null;
  let ro: ResizeObserver | null = null;

  onMount(() => {
    atlas = loadAtlas();
    S.ready = true;
    unbind = bindInput({
      S,
      stage,
      queue,
      setInteract: (on) => {
        interact = on;
      },
      tween,
      clickAt,
      hoverAt,
      clearHover: () => setHover(null),
      zoomTo,
      zoomStep,
      resetView,
      onActivity: cancelCoach,
    });
    renderAll();
    pumpPins();
    /* The observer alone: it catches a window resize as well, and unlike a window
       listener it also catches the sidebar collapsing, which the map has to
       re-fit for. */
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => {
        absorbResize();
        queue(true);
      });
      ro.observe(stage);
    }
    /* Web fonts land after first paint and change every measured label width. */
    unfonts = onFontsReady(() => queue(true));
    /* Follows the system until the switch is used, and not after — pin: false is
       what keeps a system change from overriding a deliberate choice. */
    unscheme = onSchemeChange((dark) => {
      if (!themePinned) setTheme(dark, false);
    });
  });

  onDestroy(() => {
    unbind?.();
    unfonts?.();
    unscheme?.();
    ro?.disconnect();
    tween.stop();
    anim.stop();
    if (qid) clearTimeout(qid);
    if (retry) clearTimeout(retry);
    if (fade) clearTimeout(fade);
    if (coachTimer) clearTimeout(coachTimer);
  });

  /** Repaints from outside — the sidebar collapsing changes the stage's width. */
  export function refresh(full = true): void {
    queue(full);
  }

  $: previewEntity = hovered ? entityLabel(hovered) : '';
  $: cardEntity = selected ? entityLabel(selected) : '';
  /* Not `{#if}`: keepOut() measures these nodes, and a plate is display:none
     without .show anyway. All three are exclusive — a failure is not an empty
     result, and neither is a query still running. */
  $: showEmpty = !loading && !error && projs.length === 0;
  /* Only while the map has nothing on it yet. A filter change also sets
     `loading`, and a plate flashing over a map already drawn reads as a fault. */
  $: showLoading = loading && !error && projs.length === 0;
</script>

<!-- role=application plus tabindex 0 is what makes the arrow keys, +/- and 0
     reachable without a pointer. svelte-check does not count it as interactive. -->
<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div
  class="stage"
  bind:this={stage}
  tabindex="0"
  role="application"
  aria-label={t.stageAria}
  aria-busy={loading}
>
  <Basemap bind:this={basemap} />

  <!-- Hidden from AT: PinNav is the pins' accessible equivalent, and the place
       names are decoration. -->
  <canvas id="cv" bind:this={cv} aria-hidden="true"></canvas>
  <div class="ov" bind:this={ov} aria-hidden="true"></div>

  <PinNav
    {projs}
    onFocus={onTwinFocus}
    onBlur={(d) => {
      if (hovered?.id === d.id) setHover(null);
    }}
    onSelect={(d) => onSelect(d)}
  />

  <MapCard
    kind="projcard"
    bind:el={cardEl}
    entity={cardEntity}
    title={selected?.title ?? ''}
    where={selected?.where ?? ''}
    closeLabel={t.closeEntry}
    onClose={() => onSelect(null)}
  />

  <MapCard
    kind="pinprev"
    bind:el={prevEl}
    entity={previewEntity}
    title={hovered?.title ?? ''}
    where={hovered?.where ?? ''}
  />

  <!-- Guarded like StageChrome: asking for the panel back is not the "put the
       entry away" gesture, and the two would otherwise fight. -->
  <button class="opener" type="button" on:pointerdown|stopPropagation on:click={onOpen}
    >{openerLabel}</button
  >
  <Coach {t} show={coachOn} />
  <div class="plate empty" class:show={showEmpty} bind:this={emptyEl}>{t.noProjectsMatch}</div>
  <div class="plate plate-load" class:show={showLoading} bind:this={loadEl}>{t.loadingMap}</div>
  <!-- Spoken by the sidebar's one live region, not by a second one here. -->
  <div class="plate plate-error" class:show={!!error} bind:this={errEl}>{error ?? ''}</div>
  <div class="attrib" bind:this={attribEl}>{t.attribution}</div>

  <StageChrome
    {t}
    {viewMode}
    {night}
    {lang}
    bind:zoomEl
    bind:panelEl
    onMode={setMode}
    onTheme={setTheme}
    {onLang}
    onZoom={zoomStep}
    onChromeChange={() => {
      queue(true);
      cancelCoach();
    }}
    onReset={resetView}
  />
</div>
