/**
 * The two web fonts the design needs, injected from the bundle.
 *
 * @font-face is ignored inside a shadow root, so the rules go into
 * document.head rather than into the widget's own <style>. The faces
 * themselves are base64 woff2 built into styles/fonts.css by
 * scripts/build-fonts.mjs, so this touches the network not at all — see
 * scripts/check-offline.mjs for why that matters.
 */
import faces from '../styles/fonts.css?inline';

const MARK = 'data-compass-fonts';

/** Idempotent: several <compass-map> elements on one page share the one <style>. */
export function injectFonts(): void {
  if (typeof document === 'undefined') return;
  if (document.head.querySelector(`style[${MARK}]`)) return;

  const style = document.createElement('style');
  style.setAttribute(MARK, '');
  style.textContent = faces;
  document.head.appendChild(style);
}

/**
 * Runs `cb` once the web fonts have landed; the return value unsubscribes.
 *
 * Two things have to be re-measured when Cabin arrives — the place-name pass and
 * the sheet's dock height — and each has to survive a browser with no
 * `document.fonts`. The faces are in the bundle now rather than a round trip
 * away, so this usually settles within a frame, but it is still not synchronous:
 * the browser decodes the woff2 before it can report a width.
 *
 * Unsubscribing matters because both outlive their own teardown otherwise:
 * fonts can land after the widget is gone.
 */
export function onFontsReady(cb: () => void): () => void {
  let live = true;
  const stop = () => {
    live = false;
  };
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts?.ready) return stop;
  fonts.ready
    .then(() => {
      if (live) cb();
    })
    .catch(() => {
      /* no web fonts; the fallback stack is already measured */
    });
  return stop;
}
