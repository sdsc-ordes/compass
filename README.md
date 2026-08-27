# Compass

An interactive map of ocean-focused research institutes, NGOs, and intergovernmental bodies, driven by a SHACL-validated RDF ontology.

This branch is the **client–server version**: a FastAPI backend answers SPARQL queries over the ontology and serves GeoJSON, and the widget fetches from it at runtime. The `serverless` branch does the same work in the browser with no backend — pick whichever is easier to host.

```
src/ontology/   – source-data.ods (source of truth), SHACL shapes, generated Turtle
src/backend/    – FastAPI + Oxigraph; serves GeoJSON, filter schema and facet counts
src/frontend/   – Svelte + MapLibre widget, built as a web component
docker/         – Dockerfiles and nginx config for the Compose stack
tools/scripts/  – the ontology generator and its tests
tools/nix/      – the Nix flake providing the dev shell
docs/           – contribution and development guides
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

### Option B — Nix

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

Two terminals. Backend first — the map is blank without it:

```bash
cd src/backend
uv run uvicorn app.main:app --reload --port 8000
```

```bash
cd src/frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

## Build it

```bash
cd src/frontend
npm run build         # → dist/compass-map.js
```

Loading that file defines a `<compass-map>` element. It needs `apiurl` pointing at a reachable backend:

```html
<script src="compass-map.js"></script>
<compass-map apiurl="https://api.example.org" lang="en" style="display:block;height:90vh"></compass-map>
```

[test_embed.html](test_embed.html) is a working example against `http://localhost:8000`.

Deploying this branch means hosting the FastAPI app somewhere the browser can reach, with CORS allowing the embedding domain (see `app/main.py`).

## Change the map data

`compass.ttl` and `vocab.ttl` are **generated** from `src/ontology/source-data.ods`,
a spreadsheet with three sheets. Edit it, regenerate, review the diff:

```bash
just data          # regenerate; SHACL validation gates it
git diff src/ontology/
```

The backend reads the Turtle files at startup, so restart uvicorn to pick up changes.

| File | Purpose |
|---|---|
| `src/ontology/source-data.ods` | **Source of truth** — `schemes` (the six tag dimensions), `concepts` (one row per tag term), `pins` (one row per thing on the map) |
| `src/ontology/shapes.ttl` | SHACL shapes — drive the filter UI, the SPARQL query, and instance validation |
| `src/ontology/shacl-shacl.ttl` | Meta-shapes validating that `shapes.ttl` is well-formed |
| `src/ontology/compass.ttl` | *Generated* — instance data (the pins on the map) |
| `src/ontology/vocab.ttl` | *Generated* — SKOS controlled vocabularies (topics, species, regions, …) |

Every row carries its own `id`, and rows link to each other by id in a `links`
column. **The predicate a link becomes is decided by what it points at**: a link
to a Species concept becomes `compass:species`, one to an InternationalForum
becomes `compass:forum`. So adding a tag to a pin means adding an id to its
`links` cell — nothing else. There is no configuration file and no mapping to
keep in step.

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

## Tests

```bash
just test          # backend (API, SHACL, SPARQL builder, ontology contract) and generator
just check         # Svelte + TypeScript
```
