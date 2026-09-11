<script lang="ts">
  /**
   * The stage's controls, all in one bottom-right cluster: a settings button
   * holding projection, theme and language, and the zoom stack below it.
   *
   * A pointer reaching the stage with no pin under it means "put the entry away"
   * (Stage.clickAt), so pointerdown stops at the cluster. That is the whole
   * guard: bindInput arms the window-level pointerup only from a pointerdown that
   * reached the stage. The settings panel is a DOM child of .zoom — it only looks
   * detached, because it is absolutely positioned — so it is covered by the same
   * one guard.
   */
  import { onDestroy, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import type { Strings } from '../lib/i18n';

  export let t: Strings;
  export let viewMode: 'flat' | 'globe' = 'flat';
  export let night = false;
  export let lang: 'en' | 'de' = 'en';

  export let onMode: (m: 'flat' | 'globe') => void;
  export let onTheme: (dark: boolean) => void;
  export let onLang: (l: 'en' | 'de') => void;
  export let onZoom: (factor: number) => void;
  export let onReset: () => void;
  /** Opening the panel covers map, so Stage re-places the place names. */
  export let onChromeChange: () => void = () => {};

  /** Stage measures the cluster, and the panel only while it exists. */
  export let zoomEl: HTMLDivElement | null = null;
  export let panelEl: HTMLDivElement | null = null;

  let open = false;
  let wrapEl: HTMLDivElement | null = null;
  let btnEl: HTMLButtonElement | null = null;

  /**
   * `restoreFocus` is false when the panel was closed by a pointer somewhere
   * else: pulling focus back to the button would be the one thing the visitor
   * did not ask for. On Escape it is true, because the keyboard has nowhere
   * else to land.
   */
  async function setOpen(on: boolean, restoreFocus = true): Promise<void> {
    if (open === on) return;
    /* Read before the panel goes: `held` cannot be measured once it is gone. */
    const root = wrapEl?.getRootNode() as ShadowRoot | null;
    const active = root?.activeElement as Node | null;
    const held = !!(active && panelEl?.contains(active));
    open = on;
    await tick();
    if (on) panelEl?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    else if (restoreFocus && held) btnEl?.focus({ preventScroll: true });
    /* keepOut() measures panelEl, which has only just appeared or gone. */
    onChromeChange();
  }

  /** Bound to the button and to the panel — the two places focus can be while
      the panel is open. The wrapper between them is layout and takes no role. */
  function onWrapKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || !open) return;
    /* CompassMap's root handler reads Escape as "put the entry away"; an open
       panel has to swallow it rather than close and dismiss the entry too. */
    e.stopPropagation();
    e.preventDefault();
    setOpen(false);
  }

  /* A pointer outside the cluster closes the panel. Deliberately passive — it
     only closes. Putting a selected entry away is Stage.clickAt's gesture and
     must not be fired from here. */
  let unwire: (() => void) | null = null;

  function armOutside(on: boolean): void {
    unwire?.();
    unwire = null;
    if (!on || !wrapEl) return;
    const root = wrapEl.getRootNode() as ShadowRoot | Document;
    const close = (e: Event) => {
      const target = e.target as Node | null;
      if (target && wrapEl?.contains(target)) return;
      setOpen(false, false);
    };
    root.addEventListener('pointerdown', close);
    /* A pointer on the embedding page retargets to the host element, which is
       not inside wrapEl, so the same handler answers for outside the widget. */
    document.addEventListener('pointerdown', close);
    unwire = () => {
      root.removeEventListener('pointerdown', close);
      document.removeEventListener('pointerdown', close);
    };
  }

  /* Reads `open` only; the listener handle it assigns is never read here, so this
     statement cannot re-dirty its own guard. */
  $: armOutside(open);

  onDestroy(() => unwire?.());
</script>

<div class="zoom" bind:this={zoomEl} on:pointerdown|stopPropagation>
  <div class="setwrap" bind:this={wrapEl}>
    <button
      class="setbtn"
      type="button"
      aria-expanded={open}
      aria-controls="mapset"
      aria-label={t.mapSettings}
      bind:this={btnEl}
      on:click={() => setOpen(!open)}
      on:keydown={onWrapKey}><Icon name="sliders" size={17} /></button
    >

    {#if open}
      <!-- Escape is caught on the container rather than on each control, the same
           way CompassMap catches it on .mapc. -->
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <div
        class="setpanel"
        id="mapset"
        role="group"
        aria-label={t.mapSettings}
        bind:this={panelEl}
        on:keydown={onWrapKey}
      >
        <div class="setrow">
          <span class="setlbl" id="set-proj">{t.projection}</span>
          <div
            class="seg"
            data-active={viewMode === 'globe' ? '1' : '0'}
            role="group"
            aria-labelledby="set-proj"
          >
            <span class="segthumb"></span>
            <button
              type="button"
              aria-pressed={viewMode === 'flat'}
              on:click={() => onMode('flat')}><Icon name="mapFlat" />{t.flatMap}</button
            >
            <button
              type="button"
              aria-pressed={viewMode === 'globe'}
              on:click={() => onMode('globe')}><Icon name="globe" />{t.globeMap}</button
            >
          </div>
        </div>

        <div class="setrow">
          <span class="setlbl" id="set-theme">{t.theme}</span>
          <div
            class="seg"
            data-active={night ? '1' : '0'}
            role="group"
            aria-labelledby="set-theme"
          >
            <span class="segthumb"></span>
            <button type="button" aria-pressed={!night} on:click={() => onTheme(false)}
              ><Icon name="sun" />{t.themeLight}</button
            >
            <button type="button" aria-pressed={night} on:click={() => onTheme(true)}
              ><Icon name="moon" />{t.themeDark}</button
            >
          </div>
        </div>

        <!-- Not in the design, but `de` has to stay reachable, so it joins the
             other either/or switches rather than becoming a new kind of control.
             EN and DE carry no icon: a two-letter code is already the clearest
             mark a language has, and a flag would name a country, not a language. -->
        <div class="setrow">
          <span class="setlbl" id="set-lang">{t.language}</span>
          <div
            class="seg"
            data-active={lang === 'de' ? '1' : '0'}
            role="group"
            aria-labelledby="set-lang"
          >
            <span class="segthumb"></span>
            <button type="button" aria-pressed={lang === 'en'} on:click={() => onLang('en')}
              >EN</button
            >
            <button type="button" aria-pressed={lang === 'de'} on:click={() => onLang('de')}
              >DE</button
            >
          </div>
        </div>
      </div>
    {/if}
  </div>

  <button class="zbtn" type="button" aria-label={t.zoomIn} on:click={() => onZoom(1.6)}
    ><Icon name="zoomIn" /></button
  >
  <button class="zbtn" type="button" aria-label={t.zoomOut} on:click={() => onZoom(1 / 1.6)}
    ><Icon name="zoomOut" /></button
  >
  <button class="zbtn" type="button" id="zreset" aria-label={t.resetViewAria} on:click={onReset}
    ><Icon name="reset" /></button
  >
</div>
