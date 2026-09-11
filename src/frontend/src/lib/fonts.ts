/**
 * The one stylesheet the design needs from the network.
 *
 * @font-face and <link rel=stylesheet> are ignored inside a shadow root, so the
 * Google Fonts link goes into document.head instead.
 */
const HREF =
  'https://fonts.googleapis.com/css2?family=Cabin:wght@400;500;600;700' +
  '&family=Cabin+Condensed:wght@700&display=swap';

const MARK = 'data-compass-fonts';

/** Idempotent: several <compass-map> elements on one page share the one link. */
export function injectFonts(): void {
  if (typeof document === 'undefined') return;
  if (document.head.querySelector(`link[${MARK}]`)) return;

  const link = (rel: string, href: string, cors = false) => {
    const el = document.createElement('link');
    el.rel = rel;
    el.href = href;
    if (cors) el.crossOrigin = '';
    el.setAttribute(MARK, rel);
    document.head.appendChild(el);
    return el;
  };

  /* Preconnect: the stylesheet and its font files are two origins, and the second
     needs CORS. */
  link('preconnect', 'https://fonts.googleapis.com');
  link('preconnect', 'https://fonts.gstatic.com', true);
  link('stylesheet', HREF);
}

/**
 * Runs `cb` once the web fonts have landed; the return value unsubscribes.
 *
 * Two things have to be re-measured when Cabin arrives — the place-name pass and
 * the sheet's dock height — and each has to survive a browser with no
 * `document.fonts` and a page that never loads a web font. The tab strip's
 * travelling underline was a third until the accordion replaced it, and its
 * heights are pure CSS. Unsubscribing matters because both outlive their own
 * teardown otherwise: fonts can land after the widget is gone.
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
      /* no web fonts */
    });
  return stop;
}
