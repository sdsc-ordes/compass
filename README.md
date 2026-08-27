# Compass

An interactive map of ocean-focused research institutes, NGOs, and intergovernmental bodies, driven by a SHACL-validated RDF ontology.

This branch is the **client–server version**: a FastAPI backend answers SPARQL queries over the ontology and serves GeoJSON, and the widget fetches from it at runtime. The `serverless` branch does the same work in the browser with no backend — pick whichever is easier to host.

```
src/ontology/   – SHACL shapes, and the Turtle files generated from taxonomy/
src/ontology/taxonomy/ – the three tables the content lives in (source of truth)
src/backend/    – FastAPI + Oxigraph; serves GeoJSON, filter schema and facet counts
src/frontend/   – Svelte + MapLibre widget, built as a web component
docker/         – Dockerfiles and nginx config for the Compose stack
tools/scripts/  – the ontology generator, the workbook builder, and their tests
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

`compass.ttl` and `vocab.ttl` are **generated** from three tab-separated tables in
`src/ontology/taxonomy/`. Edit a table, regenerate, review the diff:

```bash
just data          # regenerate; SHACL validation gates it
git diff src/ontology/
```

The backend reads the Turtle files at startup, so restart uvicorn to pick up changes.

| File | Purpose |
|---|---|
| `src/ontology/taxonomy/schemes.tsv` | **Source of truth** — the six tag dimensions and what to call them |
| `src/ontology/taxonomy/concepts.tsv` | **Source of truth** — one row per tag term |
| `src/ontology/taxonomy/pins.tsv` | **Source of truth** — one row per thing on the map |
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

A link to an id that does not exist fails the run, naming the table, the row and
the id. Mistakes are collected across the whole run rather than reported one per
attempt.

`just data-check` fails if the committed Turtle differs from a fresh run, which
catches a hand-edit of a generated file.

### Editing in Google Sheets

The `.tsv` files are the source of truth because they diff usefully in review, but
nobody has to edit them by hand:

```bash
just sheet         # → src/ontology/taxonomy/taxonomy.xlsx (not committed)
```

Import that workbook into Google Sheets — it arrives as three tabs with the header
frozen, columns sized, and dropdowns on `dimension` and `class`. Edit, then export
each tab back over its `.tsv` and run `just data`.

Adding a filter dimension means adding a property shape to `shapes.ttl` — the filter panel and the query follow automatically.

Country and marine boundary polygons are built separately by `just regions`
(needs network). Its `COUNTRY`/`COUNTRY_GROUP`/`MARINE` tables mirror the
Country/Area concepts by hand, so after `just data` adds or renames a region,
update `src/frontend/scripts/build-regions.mjs` to match and re-run it.

## Tests

```bash
just test          # backend (API, SHACL, SPARQL builder, ontology contract) and generator
just check         # Svelte + TypeScript
```
