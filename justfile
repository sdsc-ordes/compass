set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

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
tiles maxzoom="5":
    node "{{root_dir}}/tools/scripts/build-tiles.mjs" {{maxzoom}}

# Run the backend and generator test suites.
test *args:
    cd "{{root_dir}}/src/backend" && uv run pytest tests/ "$@"
    cd "{{root_dir}}/tools/scripts" && uv run --group dev pytest "$@"

# Type-check the frontend and verify it contacts no third party at runtime.
check:
    cd "{{root_dir}}/src/frontend" && npm run check
    cd "{{root_dir}}/src/frontend" && node scripts/check-offline.mjs

# Serve the widget's dev server.
web:
    cd "{{root_dir}}/src/frontend" && npm run dev
