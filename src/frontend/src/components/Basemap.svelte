<script lang="ts">
  /**
   * The basemap's nodes, as markup rather than d3-selection appends: lib/basemap.ts
   * only ever sets attributes on them.
   */
  import type { BasemapRefs } from '../lib/basemap';

  let svg: SVGSVGElement;
  let world: SVGGElement;
  let page: SVGRectElement;
  let sea: SVGPathElement;
  let grat: SVGPathElement;
  let land: SVGPathElement;
  let borders: SVGPathElement;
  let rim: SVGPathElement;
  let shade: SVGPathElement;
  let globeClipPath: SVGPathElement;
  let sh0: SVGStopElement;
  let sh1: SVGStopElement;
  let sh2: SVGStopElement;

  /** Called by Stage after mount; every field is bound by the markup below. */
  export function refs(): BasemapRefs {
    return {
      svg,
      world,
      page,
      sea,
      grat,
      land,
      borders,
      rim,
      shade,
      globeClipPath,
      sh0,
      sh1,
      sh2,
    };
  }
</script>

<svg id="basemap" bind:this={svg} aria-hidden="true">
  <rect class="bm-page" bind:this={page} />
  <g id="bworld" bind:this={world}>
    <path class="bm-sea" bind:this={sea} />
    <path class="bm-grat" bind:this={grat} />
    <path class="bm-land" bind:this={land} />
    <path class="bm-borders" bind:this={borders} />
    <path class="bm-rim" bind:this={rim} style="display:none" />
    <path
      class="bm-shade"
      bind:this={shade}
      fill="url(#bmGlobeShade)"
      clip-path="url(#bmGlobeClip)"
      style="display:none"
    />
  </g>
  <defs>
    <radialGradient id="bmGlobeShade">
      <stop offset="0%" bind:this={sh0} />
      <stop offset="72%" bind:this={sh1} />
      <stop offset="100%" bind:this={sh2} />
    </radialGradient>
    <clipPath id="bmGlobeClip"><path bind:this={globeClipPath} /></clipPath>
  </defs>
</svg>
