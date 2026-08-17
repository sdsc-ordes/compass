# Compass

An interactive map of ocean-focused research institutes, NGOs, and intergovernmental bodies, driven by a SHACL-validated RDF ontology.

This branch is the **client–server version**: a FastAPI backend answers SPARQL queries over the ontology and serves GeoJSON, and the widget fetches from it at runtime. The `serverless` branch does the same work in the browser with no backend — pick whichever is easier to host.

```
src/ontology/   – Turtle files: instance data, SHACL shapes, SKOS vocabularies (source of truth)
src/backend/    – FastAPI + Oxigraph; serves GeoJSON, filter schema and facet counts
src/frontend/   – Svelte + MapLibre widget, built as a web component
docker/         – Dockerfiles and nginx config for the Compose stack
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

Edit `src/ontology/compass.ttl` — copy an existing instance block and adjust it. The backend reads the Turtle files at startup, so restart uvicorn to pick up changes.

| File | Purpose |
|---|---|
| `compass.ttl` | Instance data (the pins on the map) |
| `shapes.ttl` | SHACL shapes — drive the filter UI, the SPARQL query, and instance validation |
| `vocab.ttl` | SKOS controlled vocabularies (topics, species, regions, …) |
| `shacl-shacl.ttl` | Meta-shapes validating that `shapes.ttl` is well-formed |

Adding a filter dimension means adding a property shape to `shapes.ttl` — the filter panel and the query follow automatically.

Country and marine boundary polygons come from `src/frontend/scripts/build-regions.mjs` (needs network); re-run it only after adding a Country/Area concept.

## Tests

```bash
cd src/backend && uv run pytest tests/ -v   # API, SHACL schema, SPARQL builder, ontology contract
cd src/frontend && npm run check            # Svelte + TypeScript
```
