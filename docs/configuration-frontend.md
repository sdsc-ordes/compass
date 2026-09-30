# Frontend configuration

The widget is one file, `dist/compass-map.js`, which registers `<compass-map>`.
It reads no config file at runtime. It is configured through element
attributes, the API, and source edits that need a rebuild.

## Element attributes

```html
<script src="compass-map.js"></script>
<compass-map apiurl="https://compass.example.org" lang="en"></compass-map>
```

| Attribute | Default | Meaning |
| --- | --- | --- |
| `apiurl` | `''` (page origin) | API origin for filters, entities, facets and story counts |
| `tileurl` | `''` (page origin) | Origin serving `/basemap/` (atlas) and `/bathy/` (depth rasters, including `/bathy/d/` detail tiles) |
| `lang` | `en` | `en` or `de`. A `?lang=` query parameter overrides it. |

Behind the project's nginx image both URLs can stay empty: nginx proxies `/api/`
and serves `/basemap/` and `/bathy/` on the page origin. `tools/docker/index.html`
sets both to `location.origin`.

Embedded on another origin, `tileurl` must point at a host that serves
`/basemap/` and `/bathy/` with `Access-Control-Allow-Origin` (the project's
nginx config does). The globe reads the raster back from a canvas, which fails
for a cross-origin image without that header; the depth layer then stays off.

## From the API

- `GET /api/v1/filters` returns every filter dimension (id, label, order,
  options) per language, derived from the SHACL shapes.
- `GET /api/v1/stories/count` returns the story count and the URL to link to,
  built from `STORIES_BASE_URL_EN` / `STORIES_BASE_URL_DE` (see
  [Backend configuration](configuration-backend.md)).

Adding a concept or renaming a tag needs no frontend change.

## Local development: root `.env`

`vite.config.ts` reads the repository-root `.env`, the same file Compose and
`settings.py` read. No `.env` is needed when the defaults suit.

| Variable | Default | Used for |
| --- | --- | --- |
| `COMPASS_DEV_PORT` | `5173` | Port of the dev server (`just frontend`) |
| `COMPASS_API_URL` | `http://localhost:$COMPASS_HTTP_PORT` | `apiurl` on the dev page |
| `COMPASS_HTTP_PORT` | `8780` | API port; fallback for `COMPASS_API_URL` |

The dev origin must be listed in `COMPASS_CORS_ORIGINS`, or the browser blocks
the widget's requests. The dev server uses `strictPort`, so it fails to start
rather than moving to another port outside that list.

## Use-case specific code (needs a rebuild)

| What | Where (under `src/frontend/`) |
| --- | --- |
| Class drawn with a logo, above the other pins | `src/lib/pins.ts` (`isHost`), logo in `src/assets/` |
| Short type names on the pills | `src/lib/i18n.ts` (`typeShort`) |
| Dimensions the panel draws, and their order | `src/lib/schema.ts` (`DIM_IDS`) |
| Icon per filter section | `src/lib/schema.ts` (`DIM_ICONS`) |
| Palette and type scale | `src/lib/palette.ts`, `src/styles/` |
| Interface strings, including the screen-reader page title | `src/lib/i18n.ts` |
| Web fonts | `scripts/build-fonts.mjs`, then `just map::fonts` |

`DIM_IDS` lists every concept scheme plus `entityType`, and leaves out `forum`
(it links to another pin, not a tag). An id with no matching dimension from the
API renders an empty section without an error. A scheme added to the workbook
reaches the API automatically but appears in the panel only once its id is added
to `DIM_IDS`.
