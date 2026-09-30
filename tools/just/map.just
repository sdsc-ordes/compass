set positional-arguments
set shell := ["bash", "-cue"]

root_dir := `git rev-parse --show-toplevel`

# Default recipe to list all recipes in this module.
[private]
default:
    just --list map

# Rebuild the basemap atlas and the bundled labels (needs network).
atlas:
    cd "{{root_dir}}/src/frontend" && node scripts/build-atlas.mjs

# Rebuild the self-hosted Cabin fonts (needs network).
fonts:
    cd "{{root_dir}}/src/frontend" && node scripts/build-fonts.mjs

# Fetch the GEBCO tile pyramid into src/frontend/tiles/ (needs network).
tiles maxzoom="5":
    node "{{root_dir}}/src/frontend/scripts/build-tiles.mjs" {{maxzoom}}

# Rebake the committed bathy/{flat,flat-small,equirect}.webp from the tiles.
bathymetry:
    cd "{{root_dir}}/src/frontend" && BATHY_NO_DETAIL=1 node --max-old-space-size=4096 scripts/build-bathymetry.mjs

# The larger heap holds the 16384 px mosaic the detail level is cut from.
[doc("Rebake the committed rasters plus the gitignored bathy/d/ detail tiles.")]
bathymetry-detail:
    cd "{{root_dir}}/src/frontend" && node --max-old-space-size=8192 scripts/build-bathymetry.mjs
