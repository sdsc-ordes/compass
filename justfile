set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

# Default recipe to list all recipes.
[private]
default:
    just --list

# Serve the API with hot reload. Default matches COMPASS_HTTP_PORT / Compose host port.
backend port=(env("COMPASS_HTTP_PORT", "8780")):
    cd "{{root_dir}}/src/backend" && uv run uvicorn app.main:app --reload --port {{port}}

# Serve the widget's dev server.
frontend:
    just check::frontend-standalone
    cd "{{root_dir}}/src/frontend" && npm run dev

# Run the API and widget for local development.
dev-up:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill 0' EXIT
    just backend &
    just frontend &
    wait

# Bring up the stack with docker compose.
[confirm("Bring up docker compose? [y/n]")]
deploy:
    cd "{{root_dir}}" && docker compose up --build

# Lint, format, tests, and frontend type/offline checks.
[group('modules')]
mod check 'tools/just/check.just'

# Regenerate ontology data and check freshness.
[group('modules')]
mod data 'tools/just/data.just'

# Rebuild map regions, basemap geometry, and bathymetry tiles.
[group('modules')]
mod map 'tools/just/map.just'

# Build and serve the MkDocs site.
[group('modules')]
mod docs 'tools/just/docs.just'
