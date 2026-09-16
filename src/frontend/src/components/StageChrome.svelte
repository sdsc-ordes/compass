<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import type { Strings } from '../lib/i18n';

  export let t: Strings;
  export let viewMode: 'flat' | 'globe' = 'flat';
  export let night = false;
  export let lang: 'en' | 'de' = 'en';
  export let depth = false;
  export let depthReady = false;

  export let onMode: (m: 'flat' | 'globe') => void;
  export let onTheme: (dark: boolean) => void;
  export let onDepth: (on: boolean) => void;
  export let onLang: (l: 'en' | 'de') => void;
  export let onZoom: (factor: number) => void;
  export let onReset: () => void;
  export let onChromeChange: () => void = () => {};

  export let zoomEl: HTMLDivElement | null = null;
  export let panelEl: HTMLDivElement | null = null;

  let open = false;
  let wrapEl: HTMLDivElement | null = null;
  let btnEl: HTMLButtonElement | null = null;

  async function setOpen(on: boolean, restoreFocus = true): Promise<void> {
    if (open === on) return;
    const root = wrapEl?.getRootNode() as ShadowRoot | null;
    const active = root?.activeElement as Node | null;
    const held = !!(active && panelEl?.contains(active));
    open = on;
    await tick();
    if (on) panelEl?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    else if (restoreFocus && held) btnEl?.focus({ preventScroll: true });
    onChromeChange();
  }

  function onWrapKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || !open) return;
    e.stopPropagation();
    e.preventDefault();
    setOpen(false);
  }

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
    document.addEventListener('pointerdown', close);
    unwire = () => {
      root.removeEventListener('pointerdown', close);
      document.removeEventListener('pointerdown', close);
    };
  }

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

        {#if depthReady}
          <div class="setrow">
            <span class="setlbl" id="set-depth">{t.seafloor}</span>
            <div
              class="seg"
              data-active={depth ? '0' : '1'}
              role="group"
              aria-labelledby="set-depth"
            >
              <span class="segthumb"></span>
              <button type="button" aria-pressed={depth} on:click={() => onDepth(true)}
                >{t.seafloorOn}</button
              >
              <button type="button" aria-pressed={!depth} on:click={() => onDepth(false)}
                >{t.seafloorOff}</button
              >
            </div>
          </div>
        {/if}

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
