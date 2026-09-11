set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

# Default recipe to list all recipes in this module.
[private]
default:
    just --list map

# Rebuild the Natural Earth topology the stage draws its basemap from (needs network).
atlas:
    cd "{{root_dir}}/src/frontend" && node scripts/build-atlas.mjs

# Rebuild the self-hosted Cabin faces the design uses (needs network).
fonts:
    cd "{{root_dir}}/src/frontend" && node scripts/build-fonts.mjs

# Pre-render GEBCO bathymetry tiles (needs network, ~53 MB). Kept for a later
# trial: the SVG stage does not draw them yet, but the pipeline and the nginx
# route that serves them are in place.
tiles maxzoom="5":
    node "{{root_dir}}/src/frontend/scripts/build-tiles.mjs" {{maxzoom}}
