<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { geoDistance } from 'd3-geo';
  import type { GeoProjection } from 'd3-geo';
  import { PALETTES } from '../lib/palette';
  import {
    proj,
    initialView,
    centreLonLat,
    flatOffsetFor,
    frontCentre,
    bindInput,
    fitScale,
    smallKMax,
    frameFor,
    Tweener,
    REDUCED,
    easeStandard,
    K_MIN,
    K_MAX,
    type TweenTo,
    type ViewState,
  } from '../lib/projection';
  import { loadAtlas, nudgeBasemap, renderBasemap, type Atlas } from '../lib/basemap';
  import { Bathymetry } from '../lib/bathymetry';
  import { drawPins, fanSpot, hitPin, boxFor, onFront, PinAnimator } from '../lib/pins';
  import { onFontsReady } from '../lib/fonts';
  import { placeLabels } from '../lib/labels';
  import { CardLayer } from '../lib/cards';
  import {
    entityLabel,
    isCluster,
    type Cluster,
    type PinBox,
    type PinTarget,
    type Entry,
  } from '../lib/types';
  import Basemap from './Basemap.svelte';
  import Spinner from './Spinner.svelte';
  import PinNav from './PinNav.svelte';
  import MapCard from './MapCard.svelte';
  import StageChrome from './StageChrome.svelte';
  import Coach from './Coach.svelte';
  import { fmt, loadErrorText, type Lang, type Strings } from '../lib/i18n';
  import { isMobile } from '../lib/sheet';

  export let t: Strings;
  export let entries: Entry[] = [];
  export let selected: Entry | null = null;
  export let onSelect: (p: Entry | null) => void;
  export let onTheme: (night: boolean) => void = () => {};
  export let lift: () => number = () => 0;
  // The map left seen between the filter chips and the sheet, from the stage's top.
  export let band: () => [number, number] | null = () => null;
  export let sheetEl: HTMLElement | null = null;
  export let settledWidth: () => number = () => 0;
  export let loading = false;
  export let error: string | null = null;
  export let tileurl = '';
  export let lang: Lang = 'en';
  export let onLang: (l: Lang) => void = () => {};
  // Bumped when a filter change lands new entities; a reload for a language switch leaves it.
  export let focusKey = 0;

  const S: ViewState = initialView();
  const GLIDE_MS = 620;
  let atlas: Atlas | null = null;
  let atlasError: string | null = null;
  let interacting = false;
  // Raised by the user only; interacting is also raised by a running tween.
  let gesturing = false;
  let frameId: number | null = null;
  let lastPaint = 0;
  let paintCost = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let hovered: PinTarget | null = null;
  let pinbox: PinBox[] = [];

  // The attribution links to the grid's page, which carries GEBCO's citation, DOI and terms.
  const GEBCO_GRID =
    'https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2026-grid';

  const COACH_DELAY_MS = 3000;
  let coachOn = false;
  let coachDone = false;
  let coachTimer: ReturnType<typeof setTimeout> | null = null;

  function armCoach(ready: boolean): void {
    if (coachDone || !ready) return;
    coachDone = true;
    coachTimer = setTimeout(() => {
      coachTimer = null;
      if (!selected && !error && entries.length > 0) coachOn = true;
    }, COACH_DELAY_MS);
  }

  function cancelCoach(): void {
    coachDone = true;
    if (coachTimer) {
      clearTimeout(coachTimer);
      coachTimer = null;
    }
    coachOn = false;
  }

  $: armCoach(!loading && !error && entries.length > 0);

  let viewMode: 'flat' | 'globe' = 'flat';
  let night = false;

  let stage: HTMLDivElement;
  let waterCanvas: HTMLCanvasElement;
  let pinCanvas: HTMLCanvasElement;
  let labelLayer: HTMLDivElement;
  let basemap: Basemap;
  let cardEl: HTMLDivElement;
  let previewEl: HTMLDivElement;
  let attribEl: HTMLDivElement;
  let emptyEl: HTMLDivElement;
  let loadEl: HTMLDivElement;
  let errEl: HTMLDivElement;
  let zoomEl: HTMLDivElement;
  let panelEl: HTMLDivElement | null = null;
  let chipbarEl: HTMLDivElement;

  const cards = new CardLayer({ preview: () => previewEl, card: () => cardEl });

  // On by default, as a small stage starts on the light raster (bathymetry.ts).
  let depth = true;
  let depthReady = true;
  let depthAvailable = false;
  const bathy = new Bathymetry(tileurl, () => {
    syncDepth();
    queue();
  });

  function syncDepth(): void {
    depthReady = bathy.ready;
    depthAvailable = bathy.available;
  }

  const anim = new PinAnimator(paintPins, () => {
    if (interacting || !stage || !atlas) return;
    const [W, H] = stageSize();
    if (W && H) runLabels(proj(S, W, H), W, H);
  });
  const tween = new Tweener(S, queue, (on) => {
    interacting = on;
  });

  const stageSize = (): [number, number] => [stage.clientWidth, stage.clientHeight];

  function queue(full?: boolean): void {
    if (!S.ready || frameId) return;
    // Mid-gesture, frames are spaced by the measured cost of recent paints, so only
    // a frame that overran slows the rate.
    const gap = interacting && !full ? Math.min(32, paintCost) : 0;
    const step = (now: number): void => {
      if (gap && now - lastPaint < gap) {
        frameId = requestAnimationFrame(step);
        return;
      }
      frameId = null;
      lastPaint = now;
      const t0 = performance.now();
      renderAll();
      if (interacting) paintCost = paintCost * 0.6 + (performance.now() - t0) * 0.4;
    };
    frameId = requestAnimationFrame(step);
  }

  function renderAll(): void {
    if (!atlas || !stage) return;
    const [W, H] = stageSize();
    if (!W || !H) {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => queue(true), 80);
      return;
    }
    fitKMax(W, H);
    if (!interacting || !nudgeBasemap(basemap.refs(), S, W, H))
      renderBasemap(basemap.refs(), S, W, H, atlas);
    const pr = paintPinCanvas(W, H);
    if (!pr) return;
    paintWater(pr, W, H);
    if (!interacting) runLabels(pr, W, H);
    else labelLayer.textContent = '';
  }

  function fitKMax(W: number, H: number): void {
    S.kMax = isMobile() ? smallKMax(W, H) : K_MAX;
    S.k = Math.min(S.k, S.kMax);
  }

  function paintPins(): void {
    if (!stage || !pinCanvas) return;
    const [W, H] = stageSize();
    if (W && H) paintPinCanvas(W, H);
  }

  // Size the canvas to W x H CSS px at the device pixel ratio (capped at 2).
  function scaledContext(
    canvas: HTMLCanvasElement,
    W: number,
    H: number,
  ): { ctx: CanvasRenderingContext2D; dpr: number } | null {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, dpr };
  }

  function paintPinCanvas(W: number, H: number): GeoProjection | null {
    const ctx = scaledContext(pinCanvas, W, H)?.ctx;
    if (!ctx) return null;
    ctx.clearRect(0, 0, W, H);
    const pr = proj(S, W, H);
    pinbox = drawPins({
      ctx,
      pr,
      W,
      H,
      p: PALETTES[S.theme],
      S,
      anim,
      visible: entries,
      selected,
      touch: isMobile(),
      clusterLabel: (n) => ({ title: fmt(t.clusterTitle, { n }), where: t.clusterWhere }),
    });
    syncPinPreview();
    positionProjectCard();
    return pr;
  }

  function paintWater(pr: GeoProjection, W: number, H: number): void {
    if (!waterCanvas) return;
    const scaled = scaledContext(waterCanvas, W, H);
    if (!scaled) return;
    const { ctx, dpr } = scaled;
    bathy.paint(ctx, pr, W, H, PALETTES[S.theme], S.view === 'globe', interacting, depth, dpr);
    syncDepth();
  }

  function pumpPins(list: Entry[] = entries): void {
    if (!S.ready) return;
    anim.pump(list, selected?.id ?? null, hovered?.id ?? null);
  }

  type Box = { x: number; y: number; w: number; h: number };

  function keepOut(): Box[] {
    const sr = stage.getBoundingClientRect();
    const boxes: Box[] = [];
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
    [attribEl, emptyEl, loadEl, errEl].forEach((el) => add(el, 40, 16));
    [zoomEl, panelEl, chipbarEl].forEach((el) => add(el, 30, 20));
    if (isMobile()) add(sheetEl, 20, 16);
    return boxes;
  }

  function runLabels(pr: GeoProjection, W: number, H: number): void {
    const ctx = pinCanvas.getContext('2d');
    if (!ctx || !atlas) return;
    placeLabels({
      pr,
      W,
      H,
      p: PALETTES[S.theme],
      S,
      ov: labelLayer,
      pinbox,
      keepOut: keepOut(),
      measureCtx: ctx,
      cty: atlas.cty,
      sea: atlas.sea,
      land: atlas.land,
      lang,
      depth: depth && depthAvailable,
    });
  }

  function zoomTo(k: number, mx: number, my: number): void {
    k = Math.max(K_MIN, Math.min(S.kMax, k));
    if (S.view === 'flat') {
      const g = k / S.k;
      S.tx = mx - g * (mx - S.tx);
      S.ty = my - g * (my - S.ty);
    }
    S.k = k;
    queue();
  }

  function zoomStep(f: number): void {
    const k = Math.max(K_MIN, Math.min(S.kMax, S.k * f));
    if (k === S.k) return;
    const [W, H] = stageSize();
    const mx = W / 2,
      my = H / 2,
      g = k / S.k;
    if (S.view === 'flat')
      tween.to({ k, tx: mx - g * (mx - S.tx), ty: my - g * (my - S.ty) }, 280);
    else tween.to({ k }, 280);
  }

  function setDepth(on: boolean): void {
    if (on === depth) return;
    depth = on;
    queue(true);
  }

  // A phone's k = 1 is a thin strip of world, so it starts closer, framed on the
  // pins in the map left between the filter chips and the docked sheet.
  const PHONE_K = 1.5;
  const HOME_PAD = 32;

  function home(): TweenTo {
    const to: TweenTo = { k: 1, tx: 0, ty: 0, rot: [-18, -8] };
    if (!isMobile() || S.view !== 'flat' || !entries.length) return to;
    const [W, H] = stageSize();
    const [top, bot] = band() ?? [0, H];
    // k = 1 positions; any other flat camera is tx/ty plus k times these
    const pr = proj({ ...S, k: 1, tx: 0, ty: 0 }, W, H);
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const d of entries) {
      const xy = pr(d.lonLat);
      if (!xy || !isFinite(xy[0]) || !isFinite(xy[1])) continue;
      x0 = Math.min(x0, xy[0]);
      x1 = Math.max(x1, xy[0]);
      y0 = Math.min(y0, xy[1]);
      y1 = Math.max(y1, xy[1]);
    }
    if (x0 > x1) return to;
    const k = Math.max(
      K_MIN,
      Math.min(PHONE_K, (W - 2 * HOME_PAD) / (x1 - x0), (bot - top - 2 * HOME_PAD) / (y1 - y0)),
    );
    return {
      ...to,
      k,
      tx: W / 2 - ((x0 + x1) / 2) * k,
      ty: (top + bot) / 2 - ((y0 + y1) / 2) * k,
    };
  }

  function resetView(): void {
    tween.to(home(), 420);
  }

  // Once, on the first entities, unless a gesture or a ?pin= got there first.
  let homed = false;
  $: if (S.ready && !homed && entries.length) {
    homed = true;
    if (!selected && !gesturing && S.view === 'flat' && S.k === 1 && !S.tx && !S.ty) {
      const to = home();
      // before the basemap is up there is nothing to glide from
      if (atlas) tween.to(to, GLIDE_MS);
      else {
        Object.assign(S, to);
        queue();
      }
    }
  }

  let fadeTimer: ReturnType<typeof setTimeout> | null = null;

  function underFade(ms: number, apply: () => void): void {
    if (REDUCED.matches) {
      apply();
      return;
    }
    stage.classList.add('swapping');
    if (fadeTimer) clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      fadeTimer = null;
      apply();
      stage.classList.remove('swapping');
    }, ms);
  }

  function setMode(m: 'flat' | 'globe'): void {
    if (m === S.view) return;
    tween.stop();
    const [W, H] = stageSize();
    const c = centreLonLat(S, W, H);
    viewMode = m;
    underFade(140, () => {
      S.view = m;
      // the phone's flat runs PHONE_K ahead of its globe, whose k = 1 already fills the width
      if (isMobile()) S.k = Math.max(K_MIN, m === 'globe' ? S.k / PHONE_K : S.k * PHONE_K);
      if (m === 'globe') {
        S.rot = [-c[0], -c[1]];
        S.tx = 0;
        S.ty = 0;
      } else Object.assign(S, flatOffsetFor(S, W, H, c));
      queue(true);
    });
  }

  function setTheme(dark: boolean): void {
    if (dark === night) return;
    night = dark;
    onTheme(dark);
    underFade(120, () => {
      S.theme = dark ? 'dark' : 'light';
      queue(true);
      pumpPins();
    });
  }

  function positionPinPreview(): void {
    cards.preview(hovered ? boxFor(pinbox, hovered.id) : undefined, stage.clientWidth);
  }

  function syncPinPreview(): void {
    if (!hovered) return;
    const gone = !isCluster(hovered) && !entries.some((d) => d.id === hovered!.id);
    if (gone || (!interacting && !boxFor(pinbox, hovered.id))) setHover(null);
    else positionPinPreview();
  }

  function setHover(p: PinTarget | null): void {
    if (hovered === p) {
      if (p) positionPinPreview();
      return;
    }
    hovered = p;
    stage.style.cursor = p ? 'pointer' : 'crosshair';
    if (p) {
      cards.openPreview();
      requestAnimationFrame(positionPinPreview);
    } else cards.closePreview();
    pumpPins();
  }

  function pinAt(e: PointerEvent): PinTarget | null {
    const r = stage.getBoundingClientRect();
    return hitPin(
      pinbox,
      e.clientX - r.left,
      e.clientY - r.top,
      e.pointerType === 'mouse' ? 0 : 22,
    );
  }

  function hoverAt(e: PointerEvent): void {
    setHover(pinAt(e));
  }

  function clickAt(e: PointerEvent): void {
    const hit = pinAt(e);
    if (hit && isCluster(hit)) zoomIntoCluster(hit);
    else onSelect(hit);
  }

  function onPinNavFocus(d: Entry): void {
    flyTo(d);
    setHover(d);
  }

  // Straight to max zoom, where whatever still overlaps fans.
  function zoomIntoCluster(cl: Cluster): void {
    setHover(null);
    const k = S.kMax;
    const [W, H] = stageSize();
    tween.to(
      S.view === 'globe'
        ? { k, rot: [-cl.lonLat[0], -cl.lonLat[1]] }
        : { k, ...flatOffsetFor(S, W, H, cl.lonLat, k) },
      GLIDE_MS,
    );
  }

  const ENTRY_K = 3.4;
  const CARD_MIN_K = 2.2;

  function positionProjectCard(): void {
    if (!selected || S.k < CARD_MIN_K || !onFront(S, selected.lonLat)) {
      cards.closeEntry();
      return;
    }
    const [W, H] = stageSize();
    // A fanned pin sits off its coordinate, so follow its drawn box.
    const b = pinbox.find((bb) => bb.target.id === selected!.id);
    cards.entry(b ? [b.x, b.y] : proj(S, W, H)(selected.lonLat), W);
  }

  let lastW = 0;
  let lastH = 0;

  function absorbResize(): void {
    if (!stage || !S.ready) return;
    const [W, H] = stageSize();
    if (!W || !H) return;
    if (!lastW || !lastH) {
      lastW = W;
      lastH = H;
      return;
    }
    if (W === lastW && H === lastH) return;
    fitKMax(W, H);
    if (S.view === 'flat' && !tween.running) {
      const want = S.k * (fitScale(lastW, lastH) / fitScale(W, H));
      if (want >= K_MIN && want <= S.kMax) {
        const c = centreLonLat(S, lastW, lastH);
        S.k = want;
        Object.assign(S, flatOffsetFor(S, W, H, c, want));
      }
    }
    lastW = W;
    lastH = H;
  }

  const ENTRY_MS = 520;
  // A phone pans at the zoom it is at, slower, on a map app's glide.
  const PAN_MS = 700;

  function zoomToProject(p: Entry): void {
    const W = settledWidth() || stage.clientWidth,
      H = stage.clientHeight;
    const up = lift();
    const frame = (k: number) => {
      if (S.view === 'globe') {
        // turned past the pin by the arc that spans `up` px on the rim
        const R = proj({ ...S, k }, W, H).scale();
        const d = (Math.asin(Math.min(1, up / R)) * 180) / Math.PI;
        return { k, rot: [-p.lonLat[0], d - p.lonLat[1]] as [number, number] };
      }
      const o = flatOffsetFor(S, W, H, p.lonLat, k);
      return { k, tx: o.tx, ty: o.ty - up };
    };
    const at = (v: typeof to) => proj({ ...S, ...v }, W, H);
    const phone = isMobile();
    let to = frame(phone ? S.k : Math.max(S.k, ENTRY_K));
    // Still clustered there (e.g. opened from a link): go to max zoom, where it fans,
    // and frame the pin's fanned spot rather than its coordinate.
    if (fanSpot(at(to), entries, p, W, H, phone)) {
      to = frame(S.kMax);
      const aim = at(to)(p.lonLat);
      for (let i = 0; i < 2 && aim && to.tx !== undefined && to.ty !== undefined; i++) {
        const f = fanSpot(at(to), entries, p, W, H, phone);
        if (!f) break;
        to.tx += aim[0] - f[0];
        to.ty += aim[1] - f[1];
      }
    }
    if (phone) tween.to(to, PAN_MS, undefined, easeStandard);
    else tween.to(to, ENTRY_MS);
  }

  function flyTo(p: Entry): void {
    const [W, H] = stageSize();
    if (S.view === 'globe') {
      if (geoDistance(p.lonLat, frontCentre(S)) < 1.0) return;
      tween.to({ rot: [-p.lonLat[0], -p.lonLat[1]] }, GLIDE_MS);
      return;
    }
    const xy = proj(S, W, H)(p.lonLat);
    if (
      xy &&
      isFinite(xy[0]) &&
      xy[0] > W * 0.2 &&
      xy[0] < W * 0.8 &&
      xy[1] > H * 0.2 &&
      xy[1] < H * 0.8
    )
      return;
    const o = flatOffsetFor(S, W, H, p.lonLat);
    tween.to({ tx: o.tx, ty: o.ty }, GLIDE_MS);
  }

  // Frame what survived a filter, unless a gesture or an open entry owns the camera.
  // An empty result keeps the view, so undoing the filter returns to it.
  function refocus(list: Entry[]): void {
    if (!stage || gesturing || selected || !list.length) return;
    const [W, H] = stageSize();
    const to = frameFor(
      S,
      W,
      H,
      list.map((d) => d.lonLat),
      band() ?? [0, H],
    );
    if (to) tween.to(to, GLIDE_MS);
  }

  let lastSelectedId: string | null = null;
  $: if (S.ready && (selected?.id ?? null) !== lastSelectedId) {
    lastSelectedId = selected?.id ?? null;
    onSelectionChanged(selected);
  }

  function onSelectionChanged(p: Entry | null): void {
    setHover(null);
    if (p) {
      cancelCoach();
      zoomToProject(p);
    } else {
      cards.closeEntry();
      tween.stop();
    }
    queue();
    pumpPins();
  }

  // Must follow the selection block: a filter that drops the open entry clears the
  // selection in the same flush, and onSelectionChanged stops the tween.
  let lastFocusKey = focusKey;
  $: if (S.ready && focusKey !== lastFocusKey) {
    lastFocusKey = focusKey;
    refocus(entries);
  }

  $: pumpPins(entries);

  let unbind: (() => void) | null = null;
  let unfonts: (() => void) | null = null;
  let ro: ResizeObserver | null = null;

  onMount(() => {
    S.ready = true;
    loadAtlas(tileurl).then(
      (a) => {
        atlas = a;
        queue(true);
      },
      (e) => {
        console.error('[Compass] Failed to load the basemap:', e);
        atlasError = loadErrorText(t, e);
      },
    );
    unbind = bindInput({
      S,
      stage,
      queue,
      setInteract: (on) => {
        interacting = on;
        gesturing = on;
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
    ro = new ResizeObserver(() => {
      absorbResize();
      renderNow();
    });
    ro.observe(stage);
    unfonts = onFontsReady(() => queue(true));
  });

  onDestroy(() => {
    unbind?.();
    unfonts?.();
    ro?.disconnect();
    tween.stop();
    anim.stop();
    if (frameId) cancelAnimationFrame(frameId);
    if (retryTimer) clearTimeout(retryTimer);
    if (fadeTimer) clearTimeout(fadeTimer);
    if (coachTimer) clearTimeout(coachTimer);
    bathy.clear();
  });

  export function refresh(full = true): void {
    queue(full);
  }

  function renderNow(): void {
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    if (!S.ready) return;
    renderAll();
  }

  $: previewEntity = hovered ? entityLabel(hovered) : '';
  $: cardEntity = selected ? entityLabel(selected) : '';
  $: shownError = error ?? atlasError;
  $: showEmpty = !loading && !shownError && !!atlas && entries.length === 0;
  $: showLoading = !shownError && (!atlas || (loading && entries.length === 0));
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div
  class="stage"
  bind:this={stage}
  tabindex="0"
  role="application"
  aria-label={t.stageAria}
  aria-busy={loading || !atlas}
>
  <canvas id="water" bind:this={waterCanvas} aria-hidden="true"></canvas>
  <Basemap bind:this={basemap} />

  <canvas id="cv" bind:this={pinCanvas} aria-hidden="true"></canvas>
  <div class="ov" bind:this={labelLayer} aria-hidden="true"></div>

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
    bind:el={previewEl}
    entity={previewEntity}
    title={hovered?.title ?? ''}
    where={hovered?.where ?? ''}
  />

  <Coach {t} show={coachOn} />
  <div class="plate empty" class:show={showEmpty} bind:this={emptyEl}>{t.noProjectsMatch}</div>
  <div class="plate plate-load" class:show={showLoading} bind:this={loadEl}>
    <Spinner />
    {t.loadingMap}
  </div>
  <div class="plate plate-error" class:show={!!shownError} bind:this={errEl}>
    {shownError ?? ''}
  </div>
  <div class="attrib" bind:this={attribEl}>
    {t.attribution}{#if depth && depthAvailable}<span class="attribsep" aria-hidden="true">
        &middot;
      </span><a
        class="attriblink"
        href={GEBCO_GRID}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${t.attribGebcoOf} ${t.newTab}`}
        on:pointerdown|stopPropagation>{t.attribGebco}</a
      >{/if}
  </div>

  <!-- the active filters, over the map on mobile; kept from the map's own gestures -->
  <div
    class="chipbar"
    bind:this={chipbarEl}
    on:pointerdown|stopPropagation
    on:wheel|stopPropagation
  >
    <slot />
  </div>

  <StageChrome
    {t}
    {viewMode}
    {night}
    {lang}
    {depth}
    {depthReady}
    bind:zoomEl
    bind:panelEl
    onMode={setMode}
    onTheme={setTheme}
    onDepth={setDepth}
    {onLang}
    onZoom={zoomStep}
    onChromeChange={() => {
      queue(true);
      cancelCoach();
    }}
    onReset={resetView}
  />

  <!-- last, so the tab order reaches the map controls before every pin -->
  <PinNav
    {entries}
    onFocus={onPinNavFocus}
    onBlur={(d) => {
      if (hovered?.id === d.id) setHover(null);
    }}
    {onSelect}
  />
</div>
