<script lang="ts">
  import { ICONS, type IconName } from '../lib/icons';

  export let name: IconName;
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
