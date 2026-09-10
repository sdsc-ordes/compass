set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

# Default recipe to list all recipes in this module.
[private]
default:
    just --list map

# Rebuild the region boundary polygons from Natural Earth (needs network).
regions:
    cd "{{root_dir}}/src/frontend" && node scripts/build-regions.mjs

# Rebuild the bundled land and border geometry the map draws itself from (needs network).
basemap:
    cd "{{root_dir}}/src/frontend" && node scripts/build-basemap.mjs

# Pre-render GEBCO bathymetry tiles (needs network, ~53 MB). Keep maxzoom in sync with TILE_MAX_ZOOM in Map.svelte.
tiles maxzoom="5":
    node "{{root_dir}}/src/frontend/scripts/build-tiles.mjs" {{maxzoom}}
