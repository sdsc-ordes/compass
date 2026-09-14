<script lang="ts">
  /**
   * The page's animal, crossing a patch of water.
   *
   * One of these stands in for each of the widget's two waits — the story count
   * in the tally box and the map plate while the engine boots. Which animal, and
   * so which motion, is lib/fauna.ts's choice and holds for the life of the page.
   *
   * The scene sizes itself from --swim-w and --swim-h and is otherwise placed by
   * whatever holds it: in the tally it is laid over the count, on the plate it
   * sits above the words.
   *
   * Decoration throughout, and aria-hidden with it. What says a wait is running
   * is the tally's live region and the plate's own text.
   */
  import { CREATURE } from '../lib/fauna';
</script>

<div class="swim swim-{CREATURE.id}" aria-hidden="true">
  <!-- Ends where the waterline is, and clips. An earlier pass filled the water
       with the panel's own ground and stacked it over the animal instead, which
       submerged it correctly and painted over the caption behind it. -->
  <div class="crest">
    <svg
      class="beast"
      viewBox={CREATURE.viewBox}
      width={CREATURE.width}
      height={CREATURE.height}
    >
      <path d={CREATURE.path} />
      {#if CREATURE.puff}
        <path class="puff" d={CREATURE.puff} />
      {/if}
    </svg>
  </div>
  <span class="sea"></span>
</div>
