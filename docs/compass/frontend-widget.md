# The Widget

One bundle, `dist/compass-map.js`, registering a `<compass-map>` custom element.
Svelte compiles to a custom element, so the whole UI lives in a shadow root and
the host page's CSS cannot reach in — the widget is embedded in a page it does
not own, OceanCare's WordPress site. The stylesheets in `src/styles/` are imported `?inline` and injected
into that root for the same reason.

## Where data comes from

`init(apiurl)` and every query after it are HTTP calls to the FastAPI backend.
The widget ships no ontology and no WASM SPARQL engine. An editorial change in
the workbook reaches the map after a regenerate and a reload, with no frontend
rebuild; the cost is that the widget cannot run without a backend.

| Call | Gives |
| --- | --- |
| `GET /api/v1/filters` | the whole filter panel — dimensions, labels, options, per language |
| `GET /api/v1/entities` | the pins, as GeoJSON |
| `GET /api/v1/entities/facets` | the per-option result counts in the panel |
| `GET /api/v1/stories/count` | the story count and the URL to link out to |

The panel is therefore **not** configured in the frontend — with one exception,
`DIM_IDS` in `src/lib/schema.ts`, which names the dimensions to draw and in what
order. A scheme added to the ontology reaches the API on its own and the panel
only after someone adds its id there. See
[Frontend configuration](configuration-frontend.md).

### OceanCare in the counts

OceanCare (`compass:HostOrganization`, in `ALWAYS_ON_CLASSES`) is drawn whatever
the filters say. The backend facet query leaves it out, and `shownFacets` in
`CompassMap` adds its pins (`hostCount`, from `isHost` in `src/lib/pins.ts`) to
every count, so no count reads below 1. The tally (`resultCount`) is left alone:
it counts what `/entities` returns, which already includes OceanCare.

## Layout

| Path | Holds |
| --- | --- |
| `src/components/` | `CompassMap` (the element), `Stage` + `Basemap` (the map), `Sidebar`, `FilterAccordion`, `FilterRows`, `ActivePills`, `DetailPane` |
| `src/lib/` | projection and camera, pins, bathymetry, labels, palette, i18n, URL state, the mobile sheet |
| `src/engine/` | the API client and its types |
| `src/styles/` | one stylesheet per region of the UI, injected into the shadow root |

## Desktop and mobile

One component tree, two layouts, split at 860 px (`isMobile` in
`src/lib/sheet.ts` — the one place to ask).

- **Desktop:** the filters sit in a rail beside the map, the active ones as
  removable pills above them. An opened pin replaces the rail with its detail
  pane.
- **Mobile:** the rail becomes a bottom sheet with three stops — `dock`, `half`,
  `full`. The active filters float as chips over the map instead. An entry opens
  at `half` with the map still live above it, and the tapped pin eases to the
  centre of that visible strip, below the chips; closing it returns to the dock.
  A filter picked from `full` drops the sheet to `half` so its effect shows.
  Each gesture on the sheet's content is settled as a drag or a scroll on its
  first move, so the host page never scrolls under it.

The URL carries the filters, or `?pin=` in their place when an entry is open, so
either can be shared.

## Design

The UI follows the OceanCare website's design system: Cabin, five colours, square
corners everywhere except the donate CTA. The map needed things that system has
no spec for — chrome, switches, chips, dense type under 18 px — so those are
deliberate extensions rather than inventions, and each carries its reason in a
comment where it is defined. Two rules earn their keep:

- **Cerulean fill means a choice, a bare cerulean numeral means a quantity.** A
  ticked filter row, and a group header's count of what you picked, are filled;
  the per-option result counts are not.
- **Text actions in the sidebar are links, not filled buttons.** The map is the
  panel's primary action; everything leaving it is a link.

## Commands

```bash
just frontend                   # dev server (type-checks first)
just dev-up                     # API and widget together
just check::frontend-standalone # svelte-check, then the no-third-party gate
just lint                       # eslint + prettier (and the Python side)
just test                       # vitest, with the backend and generator suites
```

`npm run build` in `src/frontend` produces the bundle. The offline gate is not a
formality: the widget runs on someone else's page, which must not leak its
visitors to third-party hosts, so fonts, atlas and imagery are all self-hosted
and a stray CDN reference fails the check. It runs ahead of `just frontend`, so
it is hard to miss locally — there is no frontend CI job yet.
