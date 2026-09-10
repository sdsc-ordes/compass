set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

# Default recipe to list all recipes in this module.
[private]
default:
    just --list data

# Regenerate compass.ttl and vocab.ttl from the source-data workbook.
generate:
    cd "{{root_dir}}/src/turtle-generator" && uv run ods_to_rdf.py

# Fail if the committed ontology differs from a fresh run.
check:
    cd "{{root_dir}}/src/turtle-generator" && uv run ods_to_rdf.py --check
