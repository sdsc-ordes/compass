# Configuring the Frontend for a New Use-case

The widget ships as one file, `dist/compass-map.js`, which registers a
`<compass-map>` element. Nothing in it is read from a config file at runtime —
a static bundle has none — so configuration reaches it by three routes: the
element's attributes, the API it is pointed at, and a rebuild.

## At runtime: the element's attributes

```html
<script src="compass-map.js"></script>
<compass-map apiurl="https://compass.example.org" lang="en"></compass-map>
```

| Attribute | Default | Meaning |
| --- | --- | --- |
| `apiurl` | `''` (this page's origin) | Where the API lives. Every query, facet count and story count goes here. |
| `lang` | `en` | `en` or `de`. A `?lang=` query parameter overrides it. |

Served behind the project's nginx image, `apiurl` can stay empty: nginx proxies
`/api` on the same origin, which is also why the deployed widget needs no CORS.
`tools/docker/index.html` sets it to `location.origin` explicitly, because the
origin is only known at runtime.

## From the API: everything about the ontology

The filter panel is not configured here. `GET /api/v1/filters` returns one
widget per dimension — id, label, order and every option, in the requested
language — all of it derived from the SHACL shapes. Adding a concept or renaming
a tag changes the panel with no frontend change and no rebuild.

The same is true of the stories link: `GET /api/v1/stories/count` answers with
the URL to link to, built from `STORIES_BASE_URL_EN` / `STORIES_BASE_URL_DE` in
the root `.env`. The widget names no host of its own.

## For local development: the root `.env`

`vite.config.ts` reads the repository-root `.env` — the same file Compose and
`settings.py` read — so a port is settled once.

| Variable | Default | Used for |
| --- | --- | --- |
| `COMPASS_DEV_PORT` | `5173` | The port `just frontend` serves on. |
| `COMPASS_API_URL` | `http://localhost:$COMPASS_HTTP_PORT` | What the dev page puts in `apiurl`. |
| `COMPASS_HTTP_PORT` | `8780` | Where the API listens; the fallback for the above. |

`COMPASS_DEV_PORT` must appear in `COMPASS_CORS_ORIGINS`, or the browser blocks
every request the widget makes. The dev server uses `strictPort`, so it refuses
to start rather than stepping to the next free port and falling out of that
allowlist — a drifting port is otherwise indistinguishable from a backend fault.

No `.env` is needed to run the dev stack: every default above matches
`settings.py`.

## What still needs a rebuild — and an edit

These are use-case specific and have no configuration surface yet. A deployment
that is not OceanCare's has to change them and rebuild:

| What | Where |
| --- | --- |
| Ontology and instance namespaces | `src/engine/namespaces.ts` (`COMPASS_NS`, `DATA_NS`) |
| The four classes drawn as pins | `src/engine/namespaces.ts` (`ENTITY_CLASS`) |
| The entity drawn as a star rather than a dot | `src/engine/namespaces.ts` (`FEATURED_IRI`) |
| Which dimensions the panel draws, and in what order | `src/lib/schema.ts` (`DIM_IDS`) |
| The icon on each filter section | `src/lib/schema.ts` (`DIM_ICONS`) |
| Palette and type scale | `src/lib/palette.ts`, `src/styles/` |
| Logo | `src/assets/oceancare.png` |
| Interface strings, including the screen-reader page title | `src/lib/i18n.ts` |
| The two web fonts | `scripts/build-fonts.mjs`, then `just map::fonts` |

`DIM_IDS` is the sharpest edge of these: it names dimensions the API may or may
not return, and a name that does not match a widget id renders an empty section
rather than failing. It now lists every concept scheme the source spreadsheet
defines, plus `entityType` and `relatedProject`, which are not schemes — so the
panel offers the whole vocabulary. `forum` is the one widget the API returns
that it leaves out. Keeping that true as the ontology grows is still a manual
step: a scheme added to the spreadsheet reaches the API on its own, and the
panel only after someone adds its id here.
