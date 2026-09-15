import faces from '../styles/fonts.css?inline';

const MARK = 'data-compass-fonts';

export function injectFonts(): void {
  if (typeof document === 'undefined') return;
  if (document.head.querySelector(`style[${MARK}]`)) return;

  const style = document.createElement('style');
  style.setAttribute(MARK, '');
  style.textContent = faces;
  document.head.appendChild(style);
}

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
    .catch(() => {});
  return stop;
}
