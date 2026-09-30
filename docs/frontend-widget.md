# The widget

`dist/compass-map.js` registers the `<compass-map>` custom element. Svelte
compiles it as a custom element, so the UI lives in a shadow root and the host
page's CSS does not reach it. The stylesheets in `src/styles/` are imported
`?inline` and injected into that root.

## Data

The widget ships no ontology: `init(apiurl)` and every query after it call the
FastAPI backend. Editorial changes reach the map after a regenerate and a
reload, without a frontend rebuild.

| Call | Returns |
| --- | --- |
| `GET /api/v1/filters` | Filter dimensions, labels and options per language |
| `GET /api/v1/entities` | Pins as GeoJSON |
| `GET /api/v1/entities/facets` | Per-option result counts |
| `GET /api/v1/stories/count` | Story count and link URL |

The filter panel comes from the API, except for `DIM_IDS` in
`src/lib/schema.ts`, which selects and orders the dimensions to draw (see
[Frontend configuration](configuration-frontend.md)).

### Host organisation in the counts

`compass:HostOrganization` (OceanCare) is in the backend's `ALWAYS_ON_CLASSES`:
its pins show whatever the filters say. The facet query leaves them out, and
`shownFacets` in `CompassMap` adds `hostCount` (pins matching `isHost` in
`src/lib/pins.ts`) to every count. The result tally (`resultCount`) counts
what `/entities` returns, which already includes them.

## Layout

| Path | Holds |
| --- | --- |
| `src/components/` | `CompassMap` (the element), `Stage` + `Basemap` (the map), `Sidebar`, `FilterAccordion`, `FilterRows`, `ActivePills`, `DetailPane`, and smaller parts |
| `src/lib/` | Projection and camera, pins, bathymetry, labels, palette, i18n, URL state, mobile sheet |
| `src/engine/` | API client and its types |
| `src/styles/` | One stylesheet per UI region |

## Desktop and mobile

One component tree, two layouts, split at 860 px (`isMobile` in
`src/lib/sheet.ts`).

- **Desktop:** filters in a rail beside the map, active filters as removable
  pills above them. An opened pin replaces the rail with its detail pane.
- **Mobile:** the rail is a bottom sheet with stops `dock`, `half` and `full`;
  active filters float as chips over the map. An entry opens at `half` and the
  pin moves to the centre of the visible map; closing returns to `dock`. Picking
  a filter from `full` drops the sheet to `half`. A gesture on the sheet is
  classified as drag or scroll on its first move, so the host page does not
  scroll under it.

The URL carries the active filters, or `?pin=` while an entry is open.

## Texts

- **Interface strings** (buttons, captions, errors, screen-reader text):
  `src/lib/i18n.ts`, one `en` and one `de` object with the same keys.
  Placeholders like `{n}` are filled by `fmt`; keys ending in `One` are the
  singular. Needs a rebuild.
- **Data texts** (dimension names, option labels, pin names, descriptions,
  locations): the `_en` / `_de` columns of the use-case's `source-data.ods`.
  Edit, run `just data::generate`, reload the API. An empty `_de` cell falls
  back to English.

## Design

The UI follows the OceanCare website's design system: Cabin, five colours,
square corners except the donate CTA. Map-specific parts the system does not
cover (chrome, switches, chips, dense type under 18 px) are extensions, with the
reason in a comment where each is defined. Two rules:

- A cerulean **fill** marks a choice (a ticked filter row, a group header's
  selection count); a bare cerulean **numeral** is a quantity (per-option result
  counts).
- Text actions in the sidebar are links, not filled buttons.

## Commands

```bash
just frontend                    # dev server (runs the standalone check first)
just dev-up                      # API and widget together
just check::frontend-standalone  # svelte-check and the no-third-party-hosts gate
just lint                        # ESLint + Prettier, and ruff for the Python side
just test                        # vitest, plus the backend and generator suites
```

`npm run build` in `src/frontend` writes the bundle. The no-third-party-hosts
gate also runs in the CI `Widget` job.
