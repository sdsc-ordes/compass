import faces from '../styles/fonts.css?inline';

const MARK = 'data-compass-fonts';

/**
 * Add the @font-face rules to the host document, once per page: @font-face
 * inside a shadow root is not reliably applied.
 */
export function injectFonts(): void {
  if (document.head.querySelector(`style[${MARK}]`)) return;
  const style = document.createElement('style');
  style.setAttribute(MARK, '');
  style.textContent = faces;
  document.head.appendChild(style);
}

/** Call `cb` once the web fonts have loaded. Return a function that cancels it. */
export function onFontsReady(cb: () => void): () => void {
  let live = true;
  document.fonts.ready.then(() => {
    if (live) cb();
  });
  return () => {
    live = false;
  };
}
