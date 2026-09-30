# assets

Files here are bundled into `dist/compass-map.js`: Vite's library mode inlines
every imported asset as a base64 data URI, which keeps the widget a single file.

Base64 adds about a third to the size, and compressed PNGs barely gzip, so
prefer SVG for new assets.

| File                                            | Use                                                        |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `www.oceancare.org-64x64.png`                   | Host organisation pin logo (imported in `src/lib/pins.ts`) |
| `www.oceancare.org-{32x32,180x180,192x192}.png` | Favicons of the dev page (`index.html`); not bundled       |
