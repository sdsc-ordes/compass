set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

# Default recipe to list all recipes in this module.
[private]
default:
    just --list docs

# Build the MkDocs site into site/.
build:
    cd "{{root_dir}}" && uv run --group docs mkdocs build --strict

# Build then serve the MkDocs site locally (http://127.0.0.1:8888).
dev-up: build
    cd "{{root_dir}}" && uv run --group docs mkdocs serve
