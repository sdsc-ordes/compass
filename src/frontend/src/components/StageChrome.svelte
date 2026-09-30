<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import SettingRow from './SettingRow.svelte';
  import type { Lang, Strings } from '../lib/i18n';
  import { ZOOM_BTN } from '../lib/projection';

  export let t: Strings;
  export let viewMode: 'flat' | 'globe' = 'flat';
  export let night = false;
  export let lang: Lang = 'en';
  export let depth = true;
  export let depthReady = false;

  export let onMode: (m: 'flat' | 'globe') => void;
  export let onTheme: (dark: boolean) => void;
  export let onDepth: (on: boolean) => void;
  export let onLang: (l: Lang) => void;
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
    const focusInPanel = !!(active && panelEl?.contains(active));
    open = on;
    await tick();
    if (on) panelEl?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    else if (restoreFocus && focusInPanel) btnEl?.focus({ preventScroll: true });
    onChromeChange();
  }

  function closeOnEscape(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || !open) return;
    e.stopPropagation();
    e.preventDefault();
    setOpen(false);
  }

  let disarmOutside: (() => void) | null = null;

  function armOutside(on: boolean): void {
    disarmOutside?.();
    disarmOutside = null;
    if (!on || !wrapEl) return;
    const root = wrapEl.getRootNode() as ShadowRoot | Document;
    const close = (e: Event) => {
      const target = e.target as Node | null;
      if (target && wrapEl?.contains(target)) return;
      setOpen(false, false);
    };
    root.addEventListener('pointerdown', close);
    document.addEventListener('pointerdown', close);
    disarmOutside = () => {
      root.removeEventListener('pointerdown', close);
      document.removeEventListener('pointerdown', close);
    };
  }

  $: armOutside(open);

  onDestroy(() => disarmOutside?.());
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
      on:keydown={closeOnEscape}><Icon name="sliders" size={17} /></button
    >

    {#if open}
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <div
        class="setpanel"
        id="mapset"
        role="group"
        aria-label={t.mapSettings}
        bind:this={panelEl}
        on:keydown={closeOnEscape}
      >
        <SettingRow
          id="set-proj"
          label={t.projection}
          choices={[
            {
              label: t.flatMap,
              icon: 'mapFlat',
              pressed: viewMode === 'flat',
              pick: () => onMode('flat'),
            },
            {
              label: t.globeMap,
              icon: 'globe',
              pressed: viewMode === 'globe',
              pick: () => onMode('globe'),
            },
          ]}
        />
        <SettingRow
          id="set-theme"
          label={t.theme}
          choices={[
            { label: t.themeLight, icon: 'sun', pressed: !night, pick: () => onTheme(false) },
            { label: t.themeDark, icon: 'moon', pressed: night, pick: () => onTheme(true) },
          ]}
        />
        {#if depthReady}
          <SettingRow
            id="set-depth"
            label={t.seafloor}
            choices={[
              { label: t.seafloorOn, pressed: depth, pick: () => onDepth(true) },
              { label: t.seafloorOff, pressed: !depth, pick: () => onDepth(false) },
            ]}
          />
        {/if}
        <SettingRow
          id="set-lang"
          label={t.language}
          choices={[
            { label: 'EN', pressed: lang === 'en', pick: () => onLang('en') },
            { label: 'DE', pressed: lang === 'de', pick: () => onLang('de') },
          ]}
        />
      </div>
    {/if}
  </div>

  <button class="zbtn" type="button" aria-label={t.zoomIn} on:click={() => onZoom(ZOOM_BTN)}
    ><Icon name="zoomIn" /></button
  >
  <button
    class="zbtn"
    type="button"
    aria-label={t.zoomOut}
    on:click={() => onZoom(1 / ZOOM_BTN)}><Icon name="zoomOut" /></button
  >
  <button class="zbtn" type="button" id="zreset" aria-label={t.resetViewAria} on:click={onReset}
    ><Icon name="reset" /></button
  >
</div>
