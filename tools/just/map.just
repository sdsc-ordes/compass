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

# Fetch the GEBCO tile pyramid (needs network; ~13 MB to z4, ~53 MB to z5).
# This is a build input only -- nothing ships it. Run `bathymetry` afterwards to
# bake it down into the two rasters the widget actually loads.
[doc("Fetch the GEBCO tile pyramid (needs network). A build input only.")]
tiles maxzoom="5":
    node "{{root_dir}}/src/frontend/scripts/build-tiles.mjs" {{maxzoom}}

# Rebake the committed pair, src/frontend/bathy/{flat,equirect}.webp (~6 MB, no
# network). These are what the widget loads: see src/frontend/src/lib/bathymetry.ts.
# Without them the map falls back to a flat sea and hides the depth switch.
# Only needed to refresh the imagery -- a fresh clone already has them.
[doc("Rebake the committed bathy/{flat,equirect}.webp pair (no network).")]
bathymetry:
    cd "{{root_dir}}/src/frontend" && BATHY_NO_DETAIL=1 node --max-old-space-size=4096 scripts/build-bathymetry.mjs

# The same, plus the d/ detail tiles the flat view lazily overlays past k~4
# (~20 MB, gitignored). Run this before `just deploy` to ship deep-zoom detail;
# without it the map simply stays at the base resolution. The detail level goes
# through a 16384x16384 mercator mosaic, hence the heap.
[doc("The same, plus the gitignored d/ detail level (~20 MB). Run before deploy.")]
bathymetry-detail:
    cd "{{root_dir}}/src/frontend" && node --max-old-space-size=8192 scripts/build-bathymetry.mjs
