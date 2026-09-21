# assets

Binary the widget ships **inside** `dist/compass-map.js`, not beside it.

Nothing here needs configuring: `vite.config.ts` builds in library mode, and
Vite inlines every asset as a base64 data URI in that mode regardless of
`assetsInlineLimit` — verified by building at the 4096-byte default and getting a
byte-identical single-file bundle. That is what keeps the widget one
self-contained script with no network calls; share/, docker/ and the WordPress
embed all load exactly one file.

The cost is real, though, and paid on every page load: base64 is ~4/3 the file's
size on disk, and an already-compressed PNG gzips badly on top of that — the last
one to ship here was 26.6 KB on disk and 29.4 KB gzipped in the bundle. Prefer SVG
for anything that lands here next: a flat-colour mark is a couple of KB, sharper at
any DPI, and gzips properly.

Nothing is inlined at the moment, so the directory is empty but for this note.
