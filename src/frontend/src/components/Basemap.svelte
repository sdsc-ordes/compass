<script lang="ts">
  import type { BasemapRefs } from '../lib/basemap';

  let svg: SVGSVGElement;
  let world: SVGGElement;
  let grat: SVGPathElement;
  let land: SVGPathElement;
  let borders: SVGPathElement;
  let rim: SVGPathElement;
  let shade: SVGPathElement;
  let globeClipPath: SVGPathElement;
  let sh0: SVGStopElement;
  let sh1: SVGStopElement;
  let sh2: SVGStopElement;

  export function refs(): BasemapRefs {
    return {
      svg,
      world,
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
  <g id="bworld" bind:this={world}>
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
