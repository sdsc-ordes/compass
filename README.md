# Compass

An interactive map of ocean-focused research institutes, NGOs, and intergovernmental bodies, driven by a SHACL-validated RDF ontology.

The map has no backend. The ontology and a SPARQL engine (oxigraph, compiled to WebAssembly) are bundled into a single JavaScript file and run in the visitor's browser, so deploying it means serving one static file.

```
src/ontology/   – source-data.ods (source of truth), SHACL shapes, generated Turtle
src/frontend/   – Svelte + MapLibre widget; the in-browser query engine is in src/engine/
src/backend/    – FastAPI reference implementation and the build-time export script
tools/scripts/  – the ontology generator and its tests
tools/nix/      – the Nix flake providing the dev shell
share/          – standalone demo page for the built widget
docs/           – deployment and WordPress integration guides
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

```bash
cd src/frontend
npm install
npm run dev
```

Open <http://localhost:5173>. There is no backend to start and no `apiurl` to configure — the map queries the ontology bundled into it.

## Build it

```bash
cd src/frontend
npm run build         # → dist/compass-map.js
```

That file is the entire widget; nothing else is emitted. Loading it defines a `<compass-map>` element, so a complete page is:

```html
<script src="compass-map.js"></script>
<compass-map lang="en" style="display:block;height:90vh"></compass-map>
```

No web server is required — copy it next to the demo page, then open that page in a browser:

```bash
cp dist/compass-map.js ../share/
```

## Change the map data

`ocean-care.ttl` and `vocab.ttl` are **generated** from `src/ontology/source-data.ods`,
a spreadsheet with three sheets. Edit it, regenerate, rebuild:

```bash
just data          # regenerate the Turtle; SHACL validation gates it
just export        # refresh src/frontend/src/generated/*.json
git diff src/ontology/
```

Both steps matter. The Turtle files are read by the in-browser engine, but the
filter schema and property specs are derived from the SHACL shapes by Python and
baked into `src/frontend/src/generated/` at build time — skip `just export` and
the widget ships a stale filter panel.

| File | Purpose |
|---|---|
| `src/ontology/source-data.ods` | **Source of truth** — `schemes` (the six tag dimensions), `concepts` (one row per tag term), `pins` (one row per thing on the map) |
| `src/ontology/shapes.ttl` | SHACL shapes — drive the filter UI, the SPARQL query, and instance validation |
| `src/ontology/shacl-shacl.ttl` | Meta-shapes validating that `shapes.ttl` is well-formed |
| `src/ontology/ocean-care.ttl` | *Generated* — instance data (the pins on the map) |
| `src/ontology/vocab.ttl` | *Generated* — SKOS controlled vocabularies (topics, species, regions, …) |
| `src/frontend/src/generated/` | *Generated* — filter schema and property specs for the browser engine |

Every row carries its own `id`, and rows link to each other by id in a `links`
column. **The predicate a link becomes is decided by what it points at**: a link
to a Species concept becomes `compass:species`, one to an InternationalForum
becomes `compass:forum`. So adding a tag to a pin means adding an id to its
`links` cell — nothing else. There is no configuration file and no mapping to
keep in step.

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
maintained by hand in `src/frontend/scripts/build-regions.mjs`.

## Optional backend

Two features need a server: the OceanCare story counts (a cross-origin page fetch) and `?state=` share links. Everything else runs in the browser.

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

Then open [test_embed.html](test_embed.html), which passes `apiurl="http://localhost:8000"`.

## Tests

```bash
just test          # backend (API, SHACL, SPARQL builder, ontology contract) and generator
just check         # Svelte + TypeScript
```
