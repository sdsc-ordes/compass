set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`
ruff_config := root_dir / "tools/configs/ruff.toml"
python_paths := "src/backend tools/scripts"

# Default recipe to list all recipes.
[private]
default:
    just --list

# Regenerate compass.ttl and vocab.ttl from the source-data workbook.
data:
    cd "{{root_dir}}/tools/scripts" && uv run tsv_to_rdf.py

# Fail if the committed ontology differs from a fresh run.
data-check:
    cd "{{root_dir}}/tools/scripts" && uv run tsv_to_rdf.py --check

# Rebuild the region boundary polygons from Natural Earth (needs network).
regions:
    cd "{{root_dir}}/src/frontend" && node scripts/build-regions.mjs

# Rebuild the bundled land and border geometry the map draws itself from (needs network).
basemap:
    cd "{{root_dir}}/src/frontend" && node scripts/build-basemap.mjs

# Pre-render GEBCO bathymetry tiles we serve ourselves (needs network, ~53 MB).
# Changing maxzoom means changing TILE_MAX_ZOOM in src/frontend/src/map/Map.svelte.
tiles maxzoom="5":
    node "{{root_dir}}/tools/scripts/build-tiles.mjs" {{maxzoom}}

# Run the backend, generator and widget test suites.
test *args:
    cd "{{root_dir}}/src/backend" && uv run pytest tests/ "$@"
    cd "{{root_dir}}/tools/scripts" && uv run --group dev pytest "$@"
    cd "{{root_dir}}/src/frontend" && npm run test

# Rewrite every source file in the project's style.
format:
    cd "{{root_dir}}" && ruff format --config "{{ruff_config}}" {{python_paths}}
    cd "{{root_dir}}" && ruff check --fix --config "{{ruff_config}}" {{python_paths}}
    cd "{{root_dir}}/src/frontend" && npm run format

# Report style and correctness problems without changing anything.
lint:
    cd "{{root_dir}}" && ruff check --config "{{ruff_config}}" {{python_paths}}
    cd "{{root_dir}}" && ruff format --check --config "{{ruff_config}}" {{python_paths}}
    cd "{{root_dir}}/src/frontend" && npm run lint
    cd "{{root_dir}}/src/frontend" && npm run format:check

# Type-check the frontend and verify it contacts no third party at runtime.
check:
    cd "{{root_dir}}/src/frontend" && npm run check
    cd "{{root_dir}}/src/frontend" && node scripts/check-offline.mjs

# Everything CI runs: lint, type-check, tests, and the ontology freshness gate.
all: lint check test data-check

# Serve the backend MkDocs site locally (http://127.0.0.1:8888).
docs:
    cd "{{root_dir}}/src/backend" && uv run --group docs mkdocs serve

# Build the backend MkDocs site into src/backend/site/.
docs-build:
    cd "{{root_dir}}/src/backend" && uv run --group docs mkdocs build --strict

# Serve the widget's dev server.
web:
    cd "{{root_dir}}/src/frontend" && npm run dev
