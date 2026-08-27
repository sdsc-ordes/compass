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

# Run the backend and generator test suites.
test *args:
    cd "{{root_dir}}/src/backend" && uv run pytest tests/ "$@"
    cd "{{root_dir}}/tools/scripts" && uv run --group dev pytest "$@"

# Type-check the frontend.
check:
    cd "{{root_dir}}/src/frontend" && npm run check

# Serve the API on port 8000.
api port="8000":
    cd "{{root_dir}}/src/backend" && uv run uvicorn app.main:app --reload --port "{{port}}"

# Serve the widget's dev server.
web:
    cd "{{root_dir}}/src/frontend" && npm run dev
