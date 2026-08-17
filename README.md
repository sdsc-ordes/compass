# Compass

An interactive map of ocean-focused research institutes, NGOs, and intergovernmental bodies, driven by a SHACL-validated RDF ontology.

The map has no backend. The ontology and a SPARQL engine (oxigraph, compiled to WebAssembly) are bundled into a single JavaScript file and run in the visitor's browser, so deploying it means serving one static file.

```
ontology/   – Turtle files: instance data (pins to be shown on map), SHACL shapes, SKOS vocabularies (source of truth)
frontend/   – Svelte + MapLibre widget; the in-browser query engine is in src/engine/
backend/    – FastAPI reference implementation and the build-time export script
share/      – standalone demo page for the built widget
docs/       – deployment and WordPress integration guides
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

No system Python needed — uv fetches its own Python 3.11, pinned in `backend/.python-version`.

### Option B — Nix on Linux

Supplies uv, Node 22 and Python 3.11 in one shell:

```bash
nix develop        # from the repo root, then run the commands below normally
```

To run a single command without entering the shell, point at the flake directory:

```bash
cd frontend && nix develop .. --command npm run dev
```

On **NixOS this option is required**. `pyoxigraph` ships as a manylinux wheel that links `libstdc++.so.6`, which NixOS does not provide globally; the flake sets the `LD_LIBRARY_PATH` that makes it loadable. Outside the shell, any Python command fails.

## Run it locally

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. There is no backend to start and no `apiurl` to configure — the map queries the ontology bundled into it.

## Build it

```bash
cd frontend
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


| File | Purpose |
|---|---|
| `compass.ttl` | Instance data |
| `shapes.ttl` | SHACL shapes — drive the filter UI, the SPARQL query, and instance validation |
| `vocab.ttl` | SKOS controlled vocabularies (topics, species, regions, …) |
| `shacl-shacl.ttl` | Meta-shapes validating that `shapes.ttl` is well-formed |

Adding a filter dimension means adding a property shape to `shapes.ttl` — the filter panel and the query follow automatically. 

Country and marine boundary polygons come from `frontend/scripts/build-regions.mjs` (needs network); re-run it only after adding a Country/Area concept.

## Optional backend

Two features need a server: the OceanCare story counts (a cross-origin page fetch) and `?state=` share links. Everything else runs in the browser.

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

Then open [test_embed.html](test_embed.html), which passes `apiurl="http://localhost:8000"`.

## Tests

```bash
cd backend && uv run pytest tests/ -v   # API, SHACL schema, SPARQL builder, ontology contract
cd frontend && npm run check            # Svelte + TypeScript
```
