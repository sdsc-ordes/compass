<script lang="ts">
  /**
   * One icon from lib/icons.ts.
   *
   * Always aria-hidden: every control that carries an icon also carries its own
   * text or aria-label, so the icon is decoration and naming it would double the
   * announcement. The stroke lives in styles/chrome.css (.ico), because styles/
   * is plain injected CSS — see lib/styles.ts.
   */
  import { ICONS, type IconName } from '../lib/icons';

  export let name: IconName;
  /** 15px is the step the stage's dense controls run at. */
  export let size = 15;
</script>

<svg
  class="ico"
  viewBox="0 0 24 24"
  width={size}
  height={size}
  aria-hidden="true"
  focusable="false"
>
  {#each ICONS[name] as d}<path {d} />{/each}
</svg>
