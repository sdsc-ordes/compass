<script lang="ts">
  /**
   * A dolphin crossing the tally box, flipping once on the way over.
   *
   * Rendered for both of the box's waits and positioned over whatever the box
   * already holds, so the wait is one gesture in both: nothing yet on screen, or
   * a count that is about to be replaced and has faded behind this.
   *
   * The silhouette is drawn here rather than in lib/icons.ts: that set is the
   * stage chrome's, 24x24 and stroked, and this is a filled shape on its own
   * grid that no control uses. Decoration throughout — the live region in
   * Tally.svelte is what says a count is coming.
   */
</script>

<div class="leap" aria-hidden="true">
  <div class="crest">
    <svg class="dolphin" viewBox="0 0 48 32" width="39" height="26">
      <path
        d="M47 13.8 C45.4 12.9 43.6 12.4 42 12.2 C41 10.2 40 8.8 38 8.2
           C34.6 6.4 31 5.7 28 6 C26.4 4.8 24.8 3.6 23 2.8
           C23.8 4.4 24.4 5.8 24.6 7.2 C18.8 8.4 12.6 10.6 7.4 13.6
           C5.6 12 3.4 10.6 1.1 9.6 C2.6 12 3.8 14 4.4 16.2
           C3.6 18.4 2.2 20.4 0.6 22.2 C3.4 21.4 6 20 8.6 18
           C12 16.8 16 16.2 20 16 C19 18.4 18.6 21 18.8 23.4
           C21 20.8 23.4 18.6 26.2 17 C31 16.2 36 15.4 41 14.9
           C43 14.7 45.4 14.4 47 13.8 Z"
      />
    </svg>
  </div>
  <span class="sea"></span>
</div>
