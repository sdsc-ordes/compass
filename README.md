# Compass

An interactive map of ocean-focused research institutes, NGOs, and intergovernmental bodies, driven by a SHACL-validated RDF ontology.

The widget is a `<compass-map>` custom element; a FastAPI service holds the ontology and answers its queries. Data lives in one place and an editorial change reaches the map without rebuilding or restarting anything. `docker compose up` brings up both.

```
src/ontology/   – source-data.ods (source of truth), SHACL shapes, generated Turtle
src/frontend/   – Svelte + MapLibre widget; src/engine/ is its thin API client
src/backend/    – FastAPI service: SPARQL over the ontology, filter schema, reload
tools/scripts/  – the ontology generator and its tests
tools/nix/      – the Nix flake providing the dev shell
share/          – standalone demo page; needs an apiurl to point at
docker/         – Dockerfiles, nginx config and the compose entry page
docs/           – contributor docs
```

## Setup

Pick one option. Every command in the rest of this README is the same either way.

### Option A — uv and Node

Works on macOS, Linux and Windows (WSL). Install [uv](https://docs.astral.sh/uv/) and [Node](https://nodejs.org) 20 or newer:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh    # uv
uv --version
node --version                                     # expect v20 or newer
```

No system Python needed — uv fetches its own Python 3.11, pinned in `src/backend/.python-version`.

### Option B — Nix on Linux

Supplies uv, Node 22 and Python 3.11 in one shell:

```bash
nix develop ./tools/nix        # then run the commands below normally
```

To run a single command without entering the shell:

```bash
cd src/frontend && nix develop ../../tools/nix --command npm run dev
```

On **NixOS this option is required**. `pyoxigraph` ships as a manylinux wheel that links `libstdc++.so.6`, which NixOS does not provide globally; the flake sets the `LD_LIBRARY_PATH` that makes it loadable. Outside the shell, any Python command fails.

## Run it locally

Both halves, together:

```bash
docker compose up --build
```

Open <http://localhost:8080>. nginx serves the widget and proxies `/api/` to the
API, so the two share an origin and no CORS is involved.

For frontend work, run the API separately and point the widget at it:

```bash
cd src/backend && uv run uvicorn app.main:app --reload --port 8000   # terminal 1
cd src/frontend && npm install && npm run dev                        # terminal 2
```

Open <http://localhost:5173>; `index.html` already passes
`apiurl="http://localhost:8000"`.

## Build it

```bash
cd src/frontend
npm run build         # → dist/compass-map.js
```

That file is the entire widget; nothing else is emitted. Loading it defines a
`<compass-map>` element, which needs `apiurl` pointing at the API:

```html
<script src="compass-map.js"></script>
<compass-map lang="en" apiurl="https://compass.example.org"
             style="display:block;height:90vh"></compass-map>
```

Serve it from the same origin as the API and `apiurl="/"` is enough, which is
what `docker/index.html` does with `location.origin`.

## Change the map data

`compass.ttl` and `vocab.ttl` are **generated** from `src/ontology/source-data.ods`,
a spreadsheet with three sheets. Edit it, regenerate, rebuild:

```bash
just data          # regenerate the Turtle; SHACL validation gates it
git diff src/ontology/
```

The API reads the Turtle at runtime, so a data change needs no rebuild of
anything. In a running deployment it also needs no restart — see
**Editorial updates** below.

| File | Purpose |
|---|---|
| `src/ontology/source-data.ods` | **Source of truth** — `schemes` (the six tag dimensions), `concepts` (one row per tag term), `pins` (one row per thing on the map) |
| `src/ontology/shapes.ttl` | SHACL shapes — drive the filter UI, the SPARQL query, and instance validation |
| `src/ontology/shacl-shacl.ttl` | Meta-shapes validating that `shapes.ttl` is well-formed |
| `src/ontology/compass.ttl` | *Generated* — instance data (the pins on the map) |
| `src/ontology/vocab.ttl` | *Generated* — SKOS controlled vocabularies (topics, species, regions, …) |

Every row carries its own `id`, and **pins** link to other rows by id in a
`links` column. **The predicate a link becomes is decided by what it points
at**: a link to a Species concept becomes `compass:species`, one to an
InternationalForum becomes `compass:forum`. So adding a tag to a pin means
adding an id to its `links` cell — nothing else. There is no configuration file
and no mapping to keep in step.

Concepts never link out: the `concepts` sheet has no `links` column, so a tag is
recorded once, on the pin that carries it. Country/Area concepts are the visible
consequence — a region is shaded on the map only because some pin passing the
active filters points at it, which is also why shading means "matching pins are
in here" rather than something maintained by hand. A region no pin refers to
stays a filter value that matches nothing.

Adding a filter dimension means adding a property shape to `shapes.ttl` — the
filter panel and the query follow automatically.

A link to an id that does not exist fails the run, naming the sheet, the row and
the id. Mistakes are collected across the whole run rather than reported one per
attempt.

`just data-check` fails if the committed Turtle differs from a fresh run, which
catches an edit that was never regenerated.

Upload the workbook to Google Sheets to edit it (the three sheets import as tabs),
then download it back as `.ods` over the committed file and run `just data`.

Git cannot diff a spreadsheet, so review happens on the generated Turtle: it is
deterministic and line-diffable, and every change in the workbook shows up there
as a changed triple. The one exception is the `notes` column, which is editorial
and never reaches the RDF.

Country and marine boundary polygons are built separately by `just regions`
(needs network). It reads `compass:isoCode` out of `vocab.ttl`, so adding a
region with a code needs no change there; the `MARINE` table for seas is still
maintained by hand in `src/frontend/scripts/build-regions.mjs`. A new region also
needs a pin pointing at it before anything shades.

## Widget requirements

Three constraints the widget has to satisfy wherever it is embedded.

### No third-party requests at runtime

The widget contacts nothing but its own origin, so embedding it leaks no
visitor data. The basemap is drawn from Natural Earth land and border geometry
bundled into the build (`src/frontend/src/map/basemap.json`, rebuilt with
`just basemap`), not from a tile service, and it carries no labels — labels
would need glyph files from a font server, and every label the map does show
comes from the ontology anyway. Cluster tallies and the OceanCare star are
drawn on a canvas at runtime for the same reason.

The bathymetry is pre-rendered by `just tiles` into `tools/tiles/` (1365 JPEG
tiles, ~53 MB, gitignored) and served by nginx from a read-only mount. The map
probes one tile on load and only adds the raster if it resolves, so a
deployment that skipped `just tiles` falls back to the vector basemap.

`just check` fails if any new host appears in the widget source. The allowlist
in `src/frontend/scripts/check-offline.mjs` holds only inert entries: RDF
namespace IRIs, which are identifiers and never fetched, and oceancare.org,
which the visitor reaches by clicking a link.

The one deliberate exception is the story counter, which calls the API origin
passed in as the `apiurl` attribute.

### Accessibility

Targeting the German BFSG criteria, which follow WCAG 2.1 AA.

The map is a canvas and carries nothing for a screen reader, so the same
results are always rendered as a table in the accessibility tree — the map view
includes an off-screen `ListView`, the very component the list view shows. One
renderer means the alternative cannot drift from what the map displays. The map
itself is a labelled `role="application"` region describing where that
alternative is.

Filtering changes results without a page load, so the result count is announced
through a polite live region. Every control has a localised accessible name,
text meets the 4.5:1 contrast floor, focus is always visible, and
`prefers-reduced-motion` suppresses the fly-to animation.

### Bilingual content

Language variants are RDF language tags, not separate records: one subject
carries `"Whales"@en` and `"Wale"@de`, and the SPARQL layer filters on the
requested language. In the workbook a translatable field is a column pair —
`name_en`/`name_de`, `description_en`/`description_de`,
`location_en`/`location_de`, `definition_en`/`definition_de` — and every pair
reaches the RDF in both languages.

An empty German cell takes the English text so a German reader never sees a
blank where an English one sees prose. `just data` reports every substitution,
so a missing translation is visible rather than silently shipped; a clean run
prints `every German cell is filled`. Some pairs are legitimately identical:
`Caracas, Venezuela` reads the same in both, and registered names such as
`British Divers Marine Life Rescue` are not translated.

## Editorial updates

The API owns the data: it reads `src/ontology/*.ttl` from disk and serves both
the entities and the filter schema, so adding a pin never touches the widget
build. `COMPASS_ONTOLOGY_DIR` points it at those files, and the compose setup
mounts them read-only from the host so the running container sees an edit
immediately.

Picking the edit up is one request:

```bash
just data                       # regenerate; SHACL validation gates it
curl -X POST -H "X-Reload-Token: $COMPASS_RELOAD_TOKEN" \
     http://localhost:8080/api/v1/admin/reload
```

The reload builds a **second** store, derives the property specs from it and
checks it can answer a query, and only then swaps it in. So a bad edit cannot
take the map down: the endpoint answers `409` naming the line that failed to
parse, and the previous version keeps serving. `503` means no
`COMPASS_RELOAD_TOKEN` is set — the endpoint is closed rather than open when
unconfigured — and `401` means the header did not match.

Nothing here needs a developer: the whole loop is regenerate, then POST.

## The API

| Route | Purpose |
|---|---|
| `GET /api/v1/entities/` | pins and regions as GeoJSON, filtered by the query string |
| `GET /api/v1/entities/facets` | per-tag counts for the current selection |
| `GET /api/v1/entities/detail` | one entity by IRI |
| `GET /api/v1/filters` | the filter panel, derived from the SHACL shapes |
| `POST /api/v1/admin/reload` | re-read the Turtle from disk (see **Editorial updates**) |
| `GET /api/v1/stories/count` | story counts from the configured upstream provider |

Share links carry the filter selection in the query string itself, so there is
no server-side state to save or expire.

Deployment serves the widget and the API from one origin (nginx proxies
`/api/`), so the API allows no cross-origin caller by default. The Vite dev
server is the exception, and `COMPASS_CORS_ORIGINS` overrides the list.

Both queries the widget makes are shaped by `shapes.ttl`: add a property shape
and the filter panel, the SPARQL and the API response all follow.

## Attribution and licences

Two data sources carry obligations, and both are surfaced in the map's
attribution control at runtime rather than only in the repository:

- **Natural Earth** (land, borders, lakes, rivers) is public domain; credit is
  requested, not required, and is given.
- **GEBCO** bathymetry is free to use with attribution. The map states
  `Imagery reproduced from the GEBCO_2026 Grid, GEBCO Compilation Group` and
  carries GEBCO's condition that it is **not to be used for navigation or any
  purpose relating to safety at sea**.

`attributionControl` is set explicitly in `Map.svelte`; leaving a licence
obligation resting on a library default would be a mistake.

The widget bundle carries third-party code under BSD-3-Clause, MIT and ISC,
all of which require their notice to accompany a distribution. Two things
satisfy that: esbuild's `legalComments: 'eof'` keeps the packages' own banners
inside the minified file, and `THIRD-PARTY-NOTICES.md` is generated from
`node_modules` on every `npm run build` and served next to the bundle. Embed
the widget elsewhere and that file has to travel with it.

## Tests

```bash
just all           # everything below, in the order CI runs it
just test          # backend (API, SHACL, SPARQL builder, ontology contract),
                   # generator, and the widget's map logic
just check         # Svelte + TypeScript, and the no-third-party-hosts gate
just lint          # ruff over both Python projects, ESLint + Prettier over the widget
just format        # rewrite every source file in the project's style
```

Python style is one shared `tools/configs/ruff.toml`; the widget's ESLint and
Prettier configs sit next to its `tsconfig.json`, and both read the repository
`.editorconfig`.
