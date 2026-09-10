# Compass

An interactive map of ocean-focused research institutes, NGOs and
intergovernmental bodies, driven by a SHACL-validated RDF ontology.

## Table of contents

- [What Compass provides](#what-compass-provides)
- [Use-cases](#use-cases)
- [Code structure](#code-structure)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Generate/update the map data](#generateupdate-the-map-data)
- [Development: run it locally](#development-run-it-locally)
- [Widget requirements](#widget-requirements)
- [Tests](#tests)
- [Attribution and licences](#attribution-and-licences)

---

## What Compass provides

### Knowledge modeling via the COMPASS ontology

Compass models a conservation organisation’s partners, projects, networks, and
international forums as RDF instances, tagged with bilingual SKOS vocabularies
(work area, conservation focus, topic, pollution, species, and country/area).
The schema and validation rules live in hand-authored SHACL shapes
(`src/ontology/shapes.ttl`); instance data and concept schemes
(`compass.ttl`, `vocab.ttl`) are generated from an editorial spreadsheet. One
subject carries language-tagged labels and descriptions, so English and German
share the same record rather than duplicating it.

### A data modeling and data generator friendly to non-semantic experts

Editors maintain the map in `src/ontology/source-data.ods` — three sheets
(`schemes`, `concepts`, `pins`) and no Turtle or SPARQL required. Links between
rows are plain ids; the generator infers the RDF predicate from the target’s
type. `just data::update` regenerates the Turtle and refuses to write unless
the result passes SHACL. Review happens on the deterministic, line-diffable
Turtle, not on the spreadsheet. The workbook can be edited in Google Sheets and
downloaded back as `.ods` over the committed file.

### An interactive map

The map is a self-contained `<compass-map>` web component (Svelte + MapLibre)
that plots forums, networks, partners, and projects, shades related regions,
and offers filter, list, and detail views. The basemap and optional bathymetry
are bundled or pre-rendered so the widget makes no third-party requests at
runtime. Content is bilingual (EN/DE), and the same results are always exposed
as an accessible list alongside the canvas.

### Map widgets and filters driven by a SHACL-validated RDF ontology

Filter chips and entity query shapes are projected from SHACL at runtime: the
backend walks property shapes into filter widgets and into the SPARQL that
answers map queries. Adding a filter dimension means adding a property shape;
the panel and the query follow. Generated data must pass SHACL before commit;
meta-shapes keep `shapes.ttl` itself well-formed. A token-guarded reload
re-parses Turtle without restarting the API, so an editorial change reaches the
map without a rebuild.

### A backend designed for integration into an existing website

Compass is built to drop into a host site: embed `<compass-map>`, point its
`apiurl` at a FastAPI ontology service, and optionally serve bathymetry tiles.
Deploy them same-origin (nginx proxies `/api/`) or cross-origin with
`COMPASS_CORS_ORIGINS`. Languages, story-link providers, and API metadata are
use-case settings — the widget itself stays a reusable custom element that only
rewrites its own URL parameters so the host page’s query string stays intact.

---

## Use-cases

### OceanCare

**Website:** [https://www.oceancare.org](https://www.oceancare.org)

OceanCare is an international marine conservation NGO founded in Switzerland in
1989. Compass’s first deployment maps their partners, projects, research
networks, and international policy forums — with bilingual content and deep
links into OceanCare’s Stories & News — so visitors can explore where and how
OceanCare works worldwide.

---

## Code Structure

```
src/ontology/   – source-data.ods (source of truth), SHACL shapes, generated Turtle
src/frontend/   – Svelte + MapLibre widget; scripts/ builds regions, basemap, tiles
src/backend/    – FastAPI service: SPARQL over the ontology, filter schema, reload
src/update-data/ – the ontology generator and its tests
tools/nix/      – the Nix flake providing the dev shell
share/          – standalone demo page; needs an apiurl to point at
tools/docker/   – Dockerfiles, nginx config and the compose entry page
docs/           – contributor docs; docs/backend is the backend MkDocs site
```

---

## Configuration

### Backend: settings

See [`docs/backend/configuration.md`](docs/backend/configuration.md) for how to
configure the backend and adapt it for a new Compass use-case. It covers API
metadata, the stories provider, language support, and deployment settings such
as `COMPASS_RELOAD_TOKEN` and `COMPASS_CORS_ORIGINS`.

### Frontend : pre-render bathymetry tiles

```bash
just map::tiles
```

Optional: the map falls back to the vector basemap if tiles are absent. The output is gitignored and belongs on the server. The script lives at `src/frontend/scripts/build-tiles.mjs`.

---

## Deployment

```bash
just deploy
```

Open <http://localhost:8780>. nginx serves the widget and proxies `/api/` to the
API, so the two share an origin and no CORS is involved. The host port defaults
to `8780` (override with `COMPASS_HTTP_PORT`) so it is less likely to collide
with other local services that claim `8080`. Inside Compose, nginx still
listens on container port `80` and the API on `8000` on the private network
only.

---

## Generate/Update the Map Data

`compass.ttl` and `vocab.ttl` are **generated** from `src/ontology/source-data.ods`,
a spreadsheet with three sheets. Edit it, regenerate, rebuild:

```bash
just data::update  # regenerate the Turtle; SHACL validation gates it
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

`just data::check` fails if the committed Turtle differs from a fresh run, which
catches an edit that was never regenerated.

Upload the workbook to Google Sheets to edit it (the three sheets import as tabs),
then download it back as `.ods` over the committed file and run `just data::update`.

Git cannot diff a spreadsheet, so review happens on the generated Turtle: it is
deterministic and line-diffable, and every change in the workbook shows up there
as a changed triple. The one exception is the `notes` column, which is editorial
and never reaches the RDF.

Country and marine boundary polygons are built separately by `just map::regions`
(needs network). It reads `compass:isoCode` out of `vocab.ttl`, so adding a
region with a code needs no change there; the `MARINE` table for seas is still
maintained by hand in `src/frontend/scripts/build-regions.mjs`. A new region also
needs a pin pointing at it before anything shades.

---

## Development: Run it locally

### Setup

Pick one option. Every command in the rest of this README is the same either way.

#### Option A — uv and Node

Works on macOS, Linux and Windows (WSL). Install [uv](https://docs.astral.sh/uv/) and [Node](https://nodejs.org) 20 or newer:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh    # uv
uv --version
node --version                                     # expect v20 or newer
```

No system Python needed — uv fetches its own Python 3.11, pinned in `src/backend/.python-version`.

#### Option B — Nix on Linux and MacOS

Supplies uv, Node 22 and Python 3.11 in one shell:

```bash
nix develop ./tools/nix        # then run the commands below normally
```

To run a single command without entering the shell:

```bash
cd src/frontend && nix develop ../../tools/nix --command npm run dev
```

On **NixOS this option is required**. `pyoxigraph` ships as a manylinux wheel that links `libstdc++.so.6`, which NixOS does not provide globally; the flake sets the `LD_LIBRARY_PATH` that makes it loadable. Outside the shell, any Python command fails.

### Local Build

For local development without Docker, run the API and widget together:

```bash
just dev-up
```

Open <http://localhost:5173>; `index.html` already passes
`apiurl="http://localhost:8000"` and serves bathymetry from the Vite origin
(`tileurl=""`). Run `just map::tiles` once so `src/frontend/tools/` exists;
without it the map falls back to the vector basemap. Or start only the widget
with `just frontend` (after the API is already up).

---

## Widget Requirements

Three constraints the widget has to satisfy wherever it is embedded.

### No third-party requests at runtime

The widget contacts nothing but its own origin, so embedding it leaks no
visitor data. The basemap is drawn from Natural Earth land and border geometry
bundled into the build (`src/frontend/src/map/basemap.json`, rebuilt with
`just map::basemap`), not from a tile service, and it carries no labels — labels
would need glyph files from a font server, and every label the map does show
comes from the ontology anyway. Cluster tallies and the OceanCare star are
drawn on a canvas at runtime for the same reason.

The bathymetry is pre-rendered by `just map::tiles` into `src/frontend/tools/` (1365 JPEG
tiles, ~53 MB, gitignored) and served by nginx from a read-only mount. The map
probes one tile on load and only adds the raster if it resolves, so a
deployment that skipped `just map::tiles` falls back to the vector basemap.

`just check::frontend-standalone` fails if any new host appears in the widget source. The allowlist
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
blank where an English one sees prose. `just data::update` reports every substitution,
so a missing translation is visible rather than silently shipped; a clean run
prints `every German cell is filled`. Some pairs are legitimately identical:
`Caracas, Venezuela` reads the same in both, and registered names such as
`British Divers Marine Life Rescue` are not translated.

--- 

## Tests

```bash
just check::all                   # lint, frontend-standalone, tests, then format
just check::tests                 # backend (API, SHACL, SPARQL builder, ontology contract),
                                  # generator, and the widget's map logic
just check::frontend-standalone   # Svelte + TypeScript, and the no-third-party-hosts gate
just check::lint                  # ruff over both Python projects, ESLint + Prettier over the widget
just check::format                # rewrite every source file in the project's style
just data::check                  # fail if the committed Turtle is stale
```

Python style is one shared `tools/configs/ruff.toml`; the widget's ESLint and
Prettier configs sit next to its `tsconfig.json`, and both read the repository
`.editorconfig`.

---

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
