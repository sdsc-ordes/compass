set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

# Default recipe to list all recipes.
[private]
default:
    just --list

# Serve the API with hot reload (default port: COMPASS_HTTP_PORT or 8780).
backend port=(env("COMPASS_HTTP_PORT", "8780")):
    cd "{{root_dir}}/src/backend" && uv run uvicorn app.main:app --reload --port {{port}}

# Type-check the widget, then serve its dev server.
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

# Rewrite every source file in the project's style.
format:
    just check::format

# Report style and correctness problems without changing anything.
lint:
    just check::lint

# Run the backend, generator and widget test suites.
test *args:
    just check::tests "$@"

# Build and start the stack with docker compose.
[confirm("Bring up docker compose? [y/n]")]
deploy:
    @test -d "{{root_dir}}/src/frontend/bathy/d" \
      || echo "note: no bathy/d -- deep zoom ships at base resolution. \`just map::bathymetry-detail\` builds it."
    cd "{{root_dir}}" && docker compose up --build

# Lint, format, test, and the widget type/offline gate.
[group('modules')]
mod check 'tools/just/check.just'

# Regenerate ontology data and check freshness.
[group('modules')]
mod data 'tools/just/data.just'

# Rebuild map assets: atlas, fonts, bathymetry.
[group('modules')]
mod map 'tools/just/map.just'

# Build and serve the MkDocs site.
[group('modules')]
mod docs 'tools/just/docs.just'
