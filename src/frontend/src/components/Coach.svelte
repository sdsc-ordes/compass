<script lang="ts">
  import Icon from './Icon.svelte';
  import type { Strings } from '../lib/i18n';

  export let t: Strings;
  export let show = false;
</script>

<div class="coach" class:show aria-hidden="true">
  <span class="coach-scrim"></span>

  <div class="coach-mid">
    <div class="coach-scene">
      <span class="coach-pin"><Icon name="pinMini" size={34} /></span>
      <span class="coach-ripple"></span>
      <span class="coach-trail"></span>
      <span class="coach-glyph coach-fine"><Icon name="cursor" size={26} /></span>
      <span class="coach-glyph coach-coarse"><Icon name="hand" size={30} /></span>
      <span class="coach-scroll coach-fine">
        <span class="sc-mouse"><Icon name="mouse" size={26} /></span>
        <span class="sc-wheel"></span>
        <span class="sc-chev"><Icon name="chevronUp" size={16} /></span>
      </span>
      <span class="coach-pinch coach-coarse">
        <span class="pn-dot pn-a"></span>
        <span class="pn-dot pn-b"></span>
      </span>
      <span class="coach-zring"></span>
    </div>

    <p class="coach-caps">
      <span class="coach-cap cap-drag">{t.coachDrag}</span>
      <span class="coach-cap cap-zoom coach-fine">{t.coachScroll}</span>
      <span class="coach-cap cap-zoom coach-coarse">{t.coachPinch}</span>
      <span class="coach-cap cap-act coach-fine">{t.coachClick}</span>
      <span class="coach-cap cap-act coach-coarse">{t.coachTap}</span>
      <span class="coach-cap cap-static">{t.coachStatic}</span>
    </p>
  </div>
</div>
