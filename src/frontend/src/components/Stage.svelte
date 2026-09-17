<script lang="ts">
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
    Tweener,
    REDUCED,
    K_MIN,
    K_MAX,
    type ViewState,
  } from '../lib/projection';
  import { loadAtlas, nudgeBasemap, renderBasemap, type Atlas } from '../lib/basemap';
  import { Bathymetry } from '../lib/bathymetry';
  import { atMaxZoom, drawPins, hitPin, boxFor, onFront, PinAnimator } from '../lib/pins';
  import { onFontsReady } from '../lib/fonts';
  import { placeLabels } from '../lib/labels';
  import { CardLayer } from '../lib/cards';
  import { entityLabel, isCluster, type PinBox, type PinTarget, type Proj } from '../lib/types';
  import Basemap from './Basemap.svelte';
  import Spinner from './Spinner.svelte';
  import PinNav from './PinNav.svelte';
  import MapCard from './MapCard.svelte';
  import StageChrome from './StageChrome.svelte';
  import Coach from './Coach.svelte';
  import { fmt, type Strings } from '../lib/i18n';

  export let t: Strings;
  export let projs: Proj[] = [];
  export let selected: Proj | null = null;
  export let onSelect: (p: Proj | null) => void;
  export let onTheme: (night: boolean) => void = () => {};
  export let lift: () => number = () => 0;
  export let sheetEl: HTMLElement | null = null;
  export let isMobile: () => boolean = () => false;
  export let settledWidth: () => number = () => 0;
  export let loading = false;
  export let error: string | null = null;
  export let tileurl = '';
  export let lang: 'en' | 'de' = 'en';
  export let onLang: (l: 'en' | 'de') => void = () => {};

  const S: ViewState = initialView();
  let atlas: Atlas | null = null;
  let interact = false;
  let qid: number | null = null;
  let painted = 0;
  let cost = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let hovered: PinTarget | null = null;
  let pinbox: PinBox[] = [];

  let fanned = false;

  function syncFan(): void {
    const want = atMaxZoom(S);
    if (want === fanned) return;
    fanned = want;
    anim.setFan(want);
  }

  const COACH_DELAY = 3000;
  let coachOn = false;
  let coachDone = false;
  let coachTimer: ReturnType<typeof setTimeout> | null = null;

  function armCoach(ready: boolean): void {
    if (coachDone || !ready) return;
    coachDone = true;
    coachTimer = setTimeout(() => {
      coachTimer = null;
      if (!selected && !error && projs.length > 0) coachOn = true;
    }, COACH_DELAY);
  }

  function cancelCoach(): void {
    coachDone = true;
    if (coachTimer) {
      clearTimeout(coachTimer);
      coachTimer = null;
    }
    if (coachOn) coachOn = false;
  }

  $: armCoach(!loading && !error && projs.length > 0);

  let viewMode: 'flat' | 'globe' = 'flat';
  let night = false;

  let stage: HTMLDivElement;
  let water: HTMLCanvasElement;
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
  let panelEl: HTMLDivElement | null = null;

  const cards = new CardLayer({ preview: () => prevEl, card: () => cardEl });

  // Off by default: the brand sea is the map's own colour, and the raster is
  // megabytes a visitor who never asks for it should not pay for. Turning the
  // switch on is what fetches it.
  let depth = false;
  let depthReady = true;
  let depthOn = false;
  const bathy = new Bathymetry(tileurl, () => {
    depthReady = bathy.ready;
    depthOn = bathy.available;
    queue();
  });

  const anim = new PinAnimator(
    () => paintPins(),
    () => {
      if (interact || !stage || !atlas) return;
      const W = stage.clientWidth,
        H = stage.clientHeight;
      if (W && H) runLabels(proj(S, W, H), W, H);
    },
  );
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
    // rAF rather than a bare timer so paints land in phase with the compositor.
    // The gap used to be a flat 36ms, which held a gesture to ~20fps however
    // little the frame actually cost; budgeting it from what the last paint
    // measured lets a cheap frame -- a nudged basemap -- run every vsync and
    // only backs off after one that genuinely overran.
    const gap = interact && !full ? Math.min(32, cost) : 0;
    const step = (now: number): void => {
      if (gap && now - painted < gap) {
        qid = requestAnimationFrame(step);
        return;
      }
      qid = null;
      painted = now;
      syncFan();
      const t0 = performance.now();
      renderAll();
      if (interact) cost = cost * 0.6 + (performance.now() - t0) * 0.4;
    };
    qid = requestAnimationFrame(step);
  }

  function renderAll(): void {
    if (!atlas || !stage) return;
    const W = stage.clientWidth,
      H = stage.clientHeight;
    if (!W || !H) {
      if (retry) clearTimeout(retry);
      retry = setTimeout(() => queue(true), 80);
      return;
    }
    if (!interact || !nudgeBasemap(basemap.refs(), S, W, H))
      renderBasemap(basemap.refs(), S, W, H, atlas);
    const pr = paintCanvas(W, H);
    if (!pr) return;
    paintWater(pr, W, H);
    if (!interact) runLabels(pr, W, H);
    else ov.textContent = '';
  }

  function paintPins(): void {
    if (!stage || !cv) return;
    const W = stage.clientWidth,
      H = stage.clientHeight;
    if (W && H) paintCanvas(W, H);
  }

  function paintCanvas(W: number, H: number): GeoProjection | null {
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
      touch: isMobile(),
      clusterLabel: (n) => ({ title: fmt(t.clusterTitle, { n }), where: t.clusterWhere }),
    });
    syncPinPreview();
    positionProjectCard();
    return pr;
  }

  function paintWater(pr: GeoProjection, W: number, H: number): void {
    if (!water) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (water.width !== W * dpr || water.height !== H * dpr) {
      water.width = W * dpr;
      water.height = H * dpr;
    }
    const ctx = water.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bathy.paint(ctx, pr, W, H, P[S.theme], S.view === 'globe', interact, depth, dpr);
    depthReady = bathy.ready;
    depthOn = bathy.available;
  }

  function pumpPins(list: Proj[] = projs): void {
    if (!S.ready) return;
    anim.pump(list, selected?.id ?? null, hovered?.id ?? null);
  }

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
    [attribEl, emptyEl, loadEl, errEl].forEach((el) => add(el, 40, 16));
    [zoomEl, panelEl].forEach((el) => add(el, 30, 20));
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
      sea: atlas.sea,
      land: atlas.land,
      lang,
      depth: depth && depthOn,
    });
  }

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

  function setDepth(on: boolean): void {
    if (on === depth) return;
    depth = on;
    queue(true);
  }

  function resetView(): void {
    tween.to({ k: 1, tx: 0, ty: 0, rot: [-18, -8] }, 420);
  }

  let fade: ReturnType<typeof setTimeout> | null = null;

  function underFade(ms: number, apply: () => void): void {
    if (REDUCED.matches) {
      apply();
      return;
    }
    stage.classList.add('swapping');
    if (fade) clearTimeout(fade);
    fade = setTimeout(() => {
      fade = null;
      apply();
      stage.classList.remove('swapping');
    }, ms);
  }

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
    if (!isCluster(hovered) && !projs.some((d) => d.id === hovered!.id)) {
      setHover(null);
      return;
    }
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
    cards.openPreview();
    requestAnimationFrame(positionPinPreview);
    pumpPins();
  }

  function pinAt(e: PointerEvent): PinTarget | null {
    const r = stage.getBoundingClientRect();
    return hitPin(pinbox, e.clientX - r.left, e.clientY - r.top);
  }

  function hoverAt(e: PointerEvent): void {
    setHover(pinAt(e));
  }

  function clickAt(e: PointerEvent): void {
    const hit = pinAt(e);
    if (!hit) {
      onSelect(null);
      return;
    }
    if (isCluster(hit)) {
      zoomIntoCluster(hit.id, hit.c);
      return;
    }
    onSelect(hit);
  }

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

  const DETAIL_K = 3.4;
  const CARD_K = 2.2;

  function positionProjectCard(): void {
    if (!selected || S.k < CARD_K || !onFront(S, selected.c)) {
      cards.closeEntry();
      return;
    }
    const W = stage.clientWidth,
      H = stage.clientHeight;
    cards.entry(proj(S, W, H)(selected.c), W);
  }

  let lastW = 0;
  let lastH = 0;

  export function absorbResize(): void {
    if (!stage || !S.ready) return;
    const W = stage.clientWidth,
      H = stage.clientHeight;
    if (!W || !H) return;
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

  const ENTRY_MS = 520;

  function zoomToProject(p: Proj): void {
    const k = Math.max(S.k, DETAIL_K);
    if (S.view === 'globe') {
      tween.to({ k, rot: [-p.c[0], -p.c[1]] }, ENTRY_MS);
      return;
    }
    const W = settledWidth() || stage.clientWidth;
    const o = flatOffsetFor(S, W, stage.clientHeight, p.c, k);
    tween.to({ k, tx: o.tx, ty: o.ty - lift() }, ENTRY_MS);
  }

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

  let lastSelectedId: string | null = null;
  $: if (S.ready && (selected?.id ?? null) !== lastSelectedId) {
    lastSelectedId = selected?.id ?? null;
    onSelectionChanged(selected);
  }

  function onSelectionChanged(p: Proj | null): void {
    setHover(null);
    if (p) {
      cancelCoach();
      zoomToProject(p);
    } else {
      cards.closeEntry();
      tween.stop();
      queue();
    }
    queue();
    pumpPins();
  }

  $: pumpPins(projs);

  let unbind: (() => void) | null = null;
  let unfonts: (() => void) | null = null;
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
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => {
        absorbResize();
        refreshNow();
      });
      ro.observe(stage);
    }
    unfonts = onFontsReady(() => queue(true));
  });

  onDestroy(() => {
    unbind?.();
    unfonts?.();
    ro?.disconnect();
    tween.stop();
    anim.stop();
    if (qid) cancelAnimationFrame(qid);
    if (retry) clearTimeout(retry);
    if (fade) clearTimeout(fade);
    if (coachTimer) clearTimeout(coachTimer);
    bathy.clear();
  });

  export function refresh(full = true): void {
    queue(full);
  }

  export function refreshNow(): void {
    if (qid) {
      cancelAnimationFrame(qid);
      qid = null;
    }
    if (!S.ready) return;
    syncFan();
    renderAll();
  }

  $: previewEntity = hovered ? entityLabel(hovered) : '';
  $: cardEntity = selected ? entityLabel(selected) : '';
  $: showEmpty = !loading && !error && projs.length === 0;
  $: showLoading = loading && !error && projs.length === 0;
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div
  class="stage"
  class:depth={depth && depthOn}
  bind:this={stage}
  tabindex="0"
  role="application"
  aria-label={t.stageAria}
  aria-busy={loading}
>
  <canvas id="water" bind:this={water} aria-hidden="true"></canvas>
  <Basemap bind:this={basemap} />

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

  <Coach {t} show={coachOn} />
  <div class="plate empty" class:show={showEmpty} bind:this={emptyEl}>{t.noProjectsMatch}</div>
  <div class="plate plate-load" class:show={showLoading} bind:this={loadEl}>
    <Spinner />
    {t.loadingMap}
  </div>
  <div class="plate plate-error" class:show={!!error} bind:this={errEl}>{error ?? ''}</div>
  <div class="attrib" bind:this={attribEl}>
    {depth && depthOn ? t.attributionDepth : t.attribution}
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
</div>
