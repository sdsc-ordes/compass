# Devlog — architecture decisions

Decisions taken while landing the v4 widget on the refactored backend, newest
first. Each is a choice with a live alternative, recorded so the alternative is
not re-argued from scratch.

## 2026-09-11 — the widget

**The UI is d3 + SVG, not MapLibre.** The v4 design — the accordion, the counted
type pills, pin fanning, the coach overlay — is drawn as SVG by `d3-geo` over a
bundled Natural Earth topology, with pins on a canvas. MapLibre gives gestures,
hit-testing and a globe for free, and we now hand-roll them in `lib/pins.ts` and
`lib/projection.ts`. We took that cost for full control of the design.
*Alternative if it stops paying: rebuild the design against a MapLibre style
spec.*

**Data comes from the API, not a bundled Oxigraph.** The widget no longer ships
the ontology or a WASM SPARQL engine; `init(apiurl)` fetches the filter widgets
and every query is HTTP. An editorial change now reaches the map without a
rebuild. The cost is that the widget cannot run without a backend — the old
file:// embed is gone, and `share/index.html` with it.

**Bathymetry is kept but unused.** `just map::tiles`, the vite dev route and the
nginx `/tiles/` mount all still work; nothing draws them. Real ocean depth is
worth having on an ocean map, so the pipeline stays for a trial rather than
being deleted and rewritten later.

## 2026-09-11 — assets and the build

**Generated assets are committed, and the build is offline.** `src/atlas.json`
(756 KB) and `src/styles/fonts.css` (55 KB) are built by hand with `just
map::atlas` / `just map::fonts` and checked in. `npm run build` and `docker
build` therefore need no network and are reproducible from the repo alone.
*Risk: editing a build script without re-running it ships a stale asset.
`just data::check` guards the ontology this way; the other two are unguarded.*

**The fonts are self-hosted.** A `<link>` to fonts.googleapis.com sent every
visitor's IP to Google — a third-party request on a page embedded in
oceancare.org, and the one thing failing `check-offline.mjs`. The latin subset of
each family is inlined as base64 in `document.head`, since `@font-face` is
ignored inside a shadow root. Ask Google for a weight **range**, not a list:
both families are variable, so a list returns the same file once per weight.
Cost: +44 KB gzipped, no request.

## 2026-09-11 — configuration

**The repository-root `.env` is the one config file.** Compose reads it,
`settings.py` reads it, and `vite.config.ts` now reads it too, so a port is
settled once. Defaults match `settings.py`, so the dev stack runs without one.
`COMPASS_DEV_PORT` must appear in `COMPASS_CORS_ORIGINS`; the dev server uses
`strictPort` because a drifting port is indistinguishable from a backend fault.

**Deployment config is configured; use-case config is not.** The stories URL now
comes from the API, so the widget names no host. But the ontology namespaces,
the pin classes, `FEATURED_IRI`, `DIM_IDS`, the palette, the logo and the
strings are still edited in source and rebuilt — see
[configuration-frontend.md](configuration-frontend.md). Making those
ontology-driven is an open design question, not an oversight.
