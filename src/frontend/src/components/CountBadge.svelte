<script lang="ts">
  import { plural, type Strings } from '../lib/i18n';

  export let t: Strings;
  export let n: number;
</script>

<span class="nbadge"
  ><span aria-hidden="true">{n}</span><span class="sr"
    >{n} {plural(n, t.activeFilterOne, t.activeFilterMany)}</span
  ></span
>
