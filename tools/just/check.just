set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`
ruff_config := root_dir / "tools/configs/ruff.toml"
python_paths := "src/backend src/turtle-generator"

# Default recipe to list all recipes in this module.
[private]
default:
    just --list check

# Run the backend, generator and widget test suites.
tests *args:
    cd "{{root_dir}}/src/backend" && uv run pytest tests/ "$@"
    cd "{{root_dir}}/src/turtle-generator" && uv run --group dev pytest "$@"
    cd "{{root_dir}}/src/frontend" && npm run test

# Rewrite every source file in the project's style.
format:
    cd "{{root_dir}}" && uv run --project src/backend ruff format --config "{{ruff_config}}" {{python_paths}}
    cd "{{root_dir}}" && uv run --project src/backend ruff check --fix --config "{{ruff_config}}" {{python_paths}}
    cd "{{root_dir}}/src/frontend" && npm run format

# Report style and correctness problems without changing anything.
lint:
    cd "{{root_dir}}" && uv run --project src/backend ruff check --config "{{ruff_config}}" {{python_paths}}
    cd "{{root_dir}}" && uv run --project src/backend ruff format --check --config "{{ruff_config}}" {{python_paths}}
    cd "{{root_dir}}/src/frontend" && npm run lint
    cd "{{root_dir}}/src/frontend" && npm run format:check

# Type-check the frontend and verify it contacts no third party at runtime.
frontend-standalone:
    cd "{{root_dir}}/src/frontend" && npm run check
    cd "{{root_dir}}/src/frontend" && node scripts/check-offline.mjs

# Run every recipe in this module: lint, type/offline gate, tests, then format.
all: format lint frontend-standalone tests
