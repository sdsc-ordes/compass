# Compass

An interactive map of ocean-focused research institutes, NGOs and
intergovernmental bodies, driven by a SHACL-validated RDF ontology.

- **Ontology.** Organisations, networks and international fora are RDF
  instances tagged with bilingual SKOS vocabularies (work areas, topics,
  programmes, species, countries / regions). Shapes and validation are in SHACL
  (`src/ontology/shapes.ttl`).
- **Spreadsheet editing.** Editors maintain an `.ods` workbook. A generator turns
  it into Turtle and refuses to write output that fails SHACL validation.
- **Map widget.** `<compass-map>` is a self-contained web component (Svelte;
  d3-geo SVG basemap, canvas pins) with filters and a detail pane. It makes no
  third-party requests at runtime.
- **Backend.** A FastAPI service derives the filter panel and the entity query
  from the SHACL shapes at runtime.

The first deployment is for [OceanCare](https://www.oceancare.org), a marine
conservation NGO: it maps OceanCare's partners, networks and international fora
and links into its Stories & News.

## Repository layout

```
src/ontology/            SHACL shapes, empty template workbook
src/ontology/oceancare/  OceanCare source-data.ods and generated Turtle
src/frontend/            Svelte widget; scripts/ builds atlas, fonts, bathymetry
src/backend/             FastAPI service: filters, entities, stories, reload
src/turtle-generator/    ODS -> RDF generator and its tests
tools/docker/            Dockerfiles, nginx config, deployed entry page
tools/just/              just modules (check, data, map, docs)
tools/nix/               Nix flake for the dev shell
docs/                    MkDocs site (this README is its overview page)
```

## Setup

Either option provides the tools every command below needs.

**uv and Node** (macOS, Linux, WSL): install [uv](https://docs.astral.sh/uv/),
[Node](https://nodejs.org) 22 and [just](https://just.systems). uv fetches the
Python version pinned in `.python-version`.

**Nix** (required on NixOS):

```bash
nix develop ./tools/nix                                   # interactive shell
nix develop ./tools/nix --command just test               # one command
```

On NixOS the shell is required: the `pyoxigraph` wheel links `libstdc++.so.6`,
and the flake puts it on `LD_LIBRARY_PATH`.

## Run locally

```bash
just dev-up      # API on :8780 and the widget dev server on :5173
```

Open <http://localhost:5173>. Ports and origins are set in the root `.env`
(template: `.env.example`); see
[frontend configuration](https://sdsc-ordes.github.io/compass/configuration-frontend/).

## Deploy

```bash
just deploy      # docker compose up --build
```

Open <http://localhost:8780> (`COMPASS_HTTP_PORT`). nginx serves the widget and
proxies `/api/` to the backend on the same origin.

The deep-zoom bathymetry tiles (`src/frontend/bathy/d/`) are gitignored and
only ship if built beforehand with `just map::tiles` and
`just map::bathymetry-detail`; see
[The map](https://sdsc-ordes.github.io/compass/frontend-map/).

## Configuration

| Topic | Page |
| --- | --- |
| New use-case folder and workbook | [Ontology](https://sdsc-ordes.github.io/compass/configuration-ontology/) |
| API metadata, stories provider, languages, reload token, CORS | [Backend](https://sdsc-ordes.github.io/compass/configuration-backend/) |
| Element attributes, dev ports, use-case specific frontend code | [Frontend](https://sdsc-ordes.github.io/compass/configuration-frontend/) |

## Map data

`COMPASS_USE_CASE` (default `oceancare`) selects the folder under
`src/ontology/` that the generator and the API read.

| File | Purpose |
| --- | --- |
| `src/ontology/template-source-data.ods` | Empty workbook (headers only) to start a new use-case |
| `src/ontology/<COMPASS_USE_CASE>/source-data.ods` | Source of truth: sheets `schemes` (tag dimensions), `concepts` (tag terms), `pins` (map entries) |
| `src/ontology/shapes.ttl` | SHACL shapes: drive the filter panel, the SPARQL query and instance validation |
| `src/ontology/shacl-shacl.ttl` | Meta-shapes that validate `shapes.ttl` |
| `src/ontology/<COMPASS_USE_CASE>/compass.ttl` | Generated: instance data |
| `src/ontology/<COMPASS_USE_CASE>/vocab.ttl` | Generated: SKOS vocabularies |

To update the data:

1. Edit `source-data.ods` in any spreadsheet app. In Google Sheets, upload it
   (the sheets import as tabs) and download it again as `.ods`.
2. Regenerate the Turtle:

   ```bash
   just data::generate
   ```

3. Make the running API pick up the new files:

   ```bash
   curl -X POST -H "X-Reload-Token: $COMPASS_RELOAD_TOKEN" \
     http://localhost:8780/api/v1/admin/reload
   ```

   An empty `COMPASS_RELOAD_TOKEN` disables the endpoint. A rejected reload
   keeps the previous ontology serving.

Workbook rules:

- Every row has an `id`. A pin tags itself by listing ids in its `links` cell;
  the predicate follows the target's type (a Species concept becomes
  `compass:species`, an InternationalForum `compass:forum`).
- The `concepts` sheet has no `links` column. A concept no pin links to is a
  filter option that matches nothing.
- A link to an unknown id fails the run with the sheet, row and id. All problems
  are reported together.
- Translatable fields are `_en` / `_de` column pairs. An empty `_de` cell falls
  back to the English text; the generator lists every fallback, or prints
  `every German cell is filled`.
- A new filter dimension needs a property shape in `shapes.ttl` and its id in
  `DIM_IDS` (`src/frontend/src/lib/schema.ts`).

## Widget constraints

**No third-party requests at runtime.** The basemap topology
(`src/frontend/public/basemap/`), the GEBCO bathymetry rasters
(`src/frontend/bathy/`) and the Cabin fonts are self-hosted, and place names are
bundled. The only runtime origin
besides `tileurl` is the API at `apiurl`. `just check::frontend-standalone` fails
if a host outside the allowlist in `src/frontend/scripts/check-offline.mjs`
appears in the widget source; the allowed hosts are RDF namespace IRIs and
link targets.

**Accessibility.** Target: WCAG 2.1 AA (German BFSG).

- The map is a labelled `role="application"` region with keyboard pan and zoom.
- Every pin is also a focusable button, so Tab reaches each entry.
- The result count is announced through a polite live region.
- `prefers-reduced-motion` disables camera and UI animations.

## Tests and checks

```bash
just check::all                   # format, lint, type/offline gate, ontology, tests
just check::tests                 # backend, generator and widget tests
just check::lint                  # ruff (both Python projects), ESLint + Prettier
just check::format                # rewrite sources in the project style
just check::frontend-standalone   # svelte-check and the no-third-party-hosts gate
just data::check                  # fail if the committed Turtle is stale
```

Python style is configured in `tools/configs/ruff.toml`; ESLint and Prettier
configs are in `src/frontend/`. Both follow `.editorconfig`.

## Attribution and licences

- **Natural Earth** (country geometry and place names): public domain; credited
  in the map's attribution line.
- **GEBCO_2026 Grid** (bathymetry): free to use on condition that the source is
  acknowledged, no endorsement by GEBCO, the IHO or the IOC is implied, and it is
  **not used for navigation or any purpose involving safety at sea**. The
  attribution line links to the grid page while the depth layer is on;
  `src/frontend/THIRD-PARTY-NOTICES.md` carries the citation and conditions.
- **Bundled npm packages** (MIT, ISC): their licences require the notice to
  accompany the bundle. `npm run build` regenerates
  `src/frontend/THIRD-PARTY-NOTICES.md` from `node_modules`, esbuild keeps the
  packages' legal comments at the end of `compass-map.js`, and the frontend
  image serves the notices file next to the bundle. Ship that file wherever you
  host the bundle.
