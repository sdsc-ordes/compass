# assets

Binary the widget ships **inside** `dist/compass-map.js`, not beside it.

Nothing here needs configuring: `vite.config.ts` builds in library mode, and
Vite inlines every asset as a base64 data URI in that mode regardless of
`assetsInlineLimit` — verified by building at the 4096-byte default and getting a
byte-identical single-file bundle. That is what keeps the widget one
self-contained script with no network calls; share/, docker/ and the WordPress
embed all load exactly one file.

The cost is real, though, and paid on every page load: base64 is ~4/3 the file's
size on disk, and an already-compressed PNG gzips badly on top of that —
oceancare.png is 26.6 KB and cost 29.4 KB gzipped. Prefer SVG. A flat-colour
logo like this one would be a couple of KB, sharper at any DPI, and would gzip
properly.
