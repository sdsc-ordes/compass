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
Schema and validation live in SHACL (`src/ontology/shapes.ttl`); instance and
vocabulary Turtle are generated from an editorial spreadsheet.

### A data modeling and data generator friendly to non-semantic experts

Editors maintain the map in a spreadsheet — no Turtle or SPARQL required. A
generator turns that workbook into RDF and refuses to publish unless it passes
SHACL. See [Generate/update the map data](#generateupdate-the-map-data).

### An interactive map

A self-contained `<compass-map>` web component (Svelte + MapLibre) plots those
entities, shades related regions, and offers filter, list, and detail views,
without third-party map traffic at runtime. Embedding and accessibility
constraints are under [Widget requirements](#widget-requirements).

### SHACL-driven filters and queries

Filter chips and entity queries are projected from SHACL at runtime, so the UI
stays aligned with the ontology. Adding a filter dimension is documented under
[Generate/update the map data](#generateupdate-the-map-data).

### A backend designed for integration into an existing website

Embed `<compass-map>`, point its `apiurl` at the FastAPI ontology service, and
adapt languages and story links in use-case config. Same-origin deploy is
covered under [Deployment](#deployment); CORS and related settings under
[Configuration](#configuration).

---

## Use-cases

### OceanCare

**Website:** [https://www.oceancare.org](https://www.oceancare.org)

OceanCare is an international marine conservation NGO founded in Switzerland in
1989. Compass’s first deployment maps their partners, projects, research
networks, and international policy forums, with deep links into OceanCare’s
Stories & News, so visitors can explore where and how OceanCare works
worldwide.

---

## Code Structure

```
src/ontology/          – SHACL shapes, template workbook; use-case data under subdirs
src/ontology/oceancare/ – OceanCare source-data.ods and generated Turtle
src/frontend/          – Svelte + MapLibre widget; scripts/ builds regions, basemap, tiles
src/backend/           – FastAPI service: SPARQL over the ontology, filter schema, reload
src/turtle-generator/  – ODS → RDF generator and its tests
tools/nix/             – the Nix flake providing the dev shell
share/                 – standalone demo page; needs an apiurl to point at
tools/docker/          – Dockerfiles, nginx config and the compose entry page
docs/                  – MkDocs site (Overview is this README; Backend + Turtle generator sections)
```

---

## Configuration

### Data & Ontology

See [ontology configuration](https://sdsc-ordes.github.io/compass/configuration-ontology/)
for the step-by-step checklist to set up a use-case folder, fill
`source-data.ods`, and run `just data::generate`.

### Backend: settings

See [backend configuration](https://sdsc-ordes.github.io/compass/configuration-backend/)
for how to configure the backend and adapt it for a new Compass use-case. It
covers API metadata, the stories provider, language support, and deployment
settings such as `COMPASS_RELOAD_TOKEN` and `COMPASS_CORS_ORIGINS`.

### Frontend

See [frontend configuration](https://sdsc-ordes.github.io/compass/configuration-frontend/).

Pre-render bathymetry tiles (optional; the map falls back to the vector basemap
if tiles are absent):

```bash
just map::tiles
```

The output is gitignored and belongs on the server. The script lives at
`src/frontend/scripts/build-tiles.mjs`.

---

## Deployment

```bash
just deploy
```

Open <http://localhost:8780>.

---

## Generate/Update the Map Data

Start from `src/ontology/template-source-data.ods` when modeling knowledge for a
new use-case: it has the three sheets and column headers the generator expects,
with no data rows. Copy it into a use-case folder under `src/ontology/` (named
to match `COMPASS_USE_CASE`, for example `src/ontology/oceancare/source-data.ods`)
and fill it in.

`COMPASS_USE_CASE` (default `oceancare`, set in `.env`) selects which subdirectory
under `src/ontology/` the generator and the API use for `source-data.ods`,
`compass.ttl`, and `vocab.ttl`. Shared files (`shapes.ttl`, the template) stay at
the ontology root.

Upload the workbook (`src/ontology/<COMPASS_USE_CASE>/source-data.ods`) to Google Sheets to edit it (the three sheets import as tabs),
then download it back as `.ods`.

`compass.ttl` and `vocab.ttl` then get **generated** into that same use-case folder:

```bash
just data::generate
```

After regenerating Turtle (and shipping the updated files into the ontology
directory the API reads), trigger a reload so the running service picks them
up without a restart:

```bash
curl -X POST -H "X-Reload-Token: $COMPASS_RELOAD_TOKEN" \
  http://localhost:8780/api/v1/admin/reload
```

Set `COMPASS_RELOAD_TOKEN` on the API (empty disables the endpoint). A rejected
reload leaves the previous ontology serving. See
[backend configuration](https://sdsc-ordes.github.io/compass/configuration-backend/).

| File | Purpose |
|---|---|
| `src/ontology/template-source-data.ods` | **Starting point** — empty workbook (headers only) for modeling a new use-case |
| `src/ontology/<COMPASS_USE_CASE>/source-data.ods` | **Source of truth** — `schemes` (the six tag dimensions), `concepts` (one row per tag term), `pins` (one row per thing on the map) |
| `src/ontology/shapes.ttl` | SHACL shapes — drive the filter UI, the SPARQL query, and instance validation |
| `src/ontology/shacl-shacl.ttl` | Meta-shapes validating that `shapes.ttl` is well-formed |
| `src/ontology/<COMPASS_USE_CASE>/compass.ttl` | *Generated* — instance data (the pins on the map) |
| `src/ontology/<COMPASS_USE_CASE>/vocab.ttl` | *Generated* — SKOS controlled vocabularies (topics, species, regions, …) |

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
`apiurl="http://localhost:8780"` and serves bathymetry from the Vite origin
(`tileurl=""`). Run `just map::tiles` once so `src/frontend/tiles/` exists;
without it the map falls back to the vector basemap.

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
blank where an English one sees prose. `just data::generate` reports every substitution,
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
