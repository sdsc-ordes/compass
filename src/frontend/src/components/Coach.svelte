<script lang="ts">
  /**
   * The first-load coach: the three things you can do with the map, mimed in the
   * middle of it, once per page load.
   *
   * It replaces the permanent instruction block that used to sit at the top
   * left. That block cost every returning visitor a corner of the map forever to
   * say something only a first-time visitor needs; this says the same thing by
   * demonstration and then goes away. `Stage` owns when — see armCoach there.
   *
   * The mime is self-contained: a stand-in pin, never a real one. Pointing at an
   * actual pin would depend on the filters, the zoom and what happens to be on
   * screen, and there is no guarantee any pin is near the middle.
   *
   * Both pointer variants are in the DOM and CSS reveals one, keyed on
   * `(pointer: coarse)` — see styles/chrome.css. That is a question of input
   * modality rather than window width, so it is not the 860px breakpoint: a small
   * desktop window still has a mouse, and this stays right if someone picks up a
   * touchscreen mid-session. Doing it in CSS also keeps it out of the JS.
   *
   * aria-hidden throughout: the stage's own `aria-label` (t.stageAria) already
   * states every keyboard equivalent, so naming this would say it all twice.
   */
  import Icon from './Icon.svelte';
  import type { Strings } from '../lib/i18n';

  export let t: Strings;
  export let show = false;
</script>

<div class="coach" class:show aria-hidden="true">
  <!-- A vignette, not a flat scrim over the map. Uniform dimming reads as a modal
       and sends people looking for the close button this deliberately has not
       got, and it hides the very thing being demonstrated. Fading to nothing
       before the edges focuses the eye and still flattens the coastline under the
       glyph, which is what buys the caption its contrast. -->
  <span class="coach-scrim"></span>

  <div class="coach-mid">
    <div class="coach-scene">
      <span class="coach-pin"><Icon name="pinMini" size={34} /></span>
      <span class="coach-ripple"></span>
      <span class="coach-trail"></span>
      <span class="coach-glyph coach-fine"><Icon name="cursor" size={26} /></span>
      <span class="coach-glyph coach-coarse"><Icon name="hand" size={30} /></span>
      <!-- The zoom beat, mimed per modality: a scroll wheel and a two-finger
           pinch are different gestures, so each input gets the one it can
           actually perform. The ring below is shared — it is the zoom itself,
           expanding, rather than anything about the hand causing it. -->
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

    <!-- Three words, not a sentence, and no box: the animation is the message and
         the caption only removes the ambiguity of a bare moving glyph. The static
         one is the reduced-motion equivalent and carries both gestures at once. -->
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
