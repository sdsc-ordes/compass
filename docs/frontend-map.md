# The map

Two views of one dataset: a flat **Equal Earth** projection (default; equal-area,
Savric, Patterson & Jenny, 2018) and an orthographic **globe**. Both are drawn
with `d3-geo`: SVG for land, borders and labels, canvas for pins and the depth
raster. There is no map library; gestures, hit-testing and pin fanning are in
`src/lib/projection.ts` and `src/lib/pins.ts`.

All map assets are generated ahead of time. Atlas and rasters are fetched from
`tileurl` at runtime; labels and fonts are bundled.

| Asset | Built by | In git |
| --- | --- | --- |
| `public/basemap/atlas.json` (fetched), `src/atlas-labels.json` (bundled) | `just map::atlas` | yes |
| `bathy/flat.webp`, `bathy/flat-small.webp`, `bathy/equirect.webp` (~6 MB) | `just map::bathymetry` | yes |
| `bathy/d/` detail tiles (~20 MB) | `just map::bathymetry-detail` | no, build before deploying |
| `tiles/` GEBCO pyramid (~53 MB) | `just map::tiles` | no, build input only |
| Cabin fonts, base64 in `src/styles/fonts.css` | `just map::fonts` | yes |

`atlas`, `fonts` and `tiles` need network access; the bathymetry bakes do not.

## Bathymetry

Source: the **GEBCO_2026 Grid**, fetched once as tiles and baked into rasters.

```
GEBCO WMS -> tiles/z0-5 (jpg) -> Web Mercator mosaic -> flat.webp, flat-small.webp
                                                     -> equirect.webp
                                                     -> d/{c}_{r}.webp
```

`scripts/build-tiles.mjs` fetches z0-z5 at 512 px from GEBCO's WMS.
`scripts/build-bathymetry.mjs` stitches z5 into one Mercator mosaic and
reprojects it; it needs the z5 tiles.

| Raster | Used for |
| --- | --- |
| `flat.webp` | Flat view. Pre-projected to Equal Earth, so pan and zoom are a single `drawImage` per frame. |
| `flat-small.webp` | 2048 px copy of `flat.webp`. Used while the stage needs no more pixels than that, and always under Save-Data. `SMALL_W` in `src/lib/bathymetry.ts` must match `FLAT_SMALL_W` in the bake script. |
| `equirect.webp` | Globe. Plate carree, resampled per frame (rotation is not affine). Fetched only when the globe opens. |
| `d/` | 2x detail level (16384 px wide, 2048 px tiles). Drawn over the base once the flat view upscales `flat.webp` past 1:1, only for tiles in view. A missing tile leaves the base showing. |

### Bake settings

- The WMS layer is pinned to `GEBCO_2026`; `GEBCO_LATEST` would change the
  imagery with each annual release.
- Saturation 0.6 (`BATHY_SAT`), to keep the depth ramp behind the pins.
- The last ~5 deg at each pole, beyond Mercator's 85.05 deg, repeat the
  outermost row. Empty pixels there would sample as a dark ray on the globe.
- Unsharp mask 0.5 (`BATHY_SHARPEN`), for deep zoom past 1:1.
- WebP quality 70 (`BATHY_Q`).

### Updating the imagery

```bash
just map::tiles              # fetch the pyramid (network, cached between runs)
just map::bathymetry         # rebake the committed rasters
just map::bathymetry-detail  # the same, plus d/ (run before `just deploy`)
```

Then commit `bathy/flat.webp`, `bathy/flat-small.webp` and `bathy/equirect.webp`.
The detail bake goes through a 16384 px mosaic; the recipe raises Node's heap
limit for it.

### At runtime

Rasters are served from `tileurl` (see
[Frontend configuration](configuration-frontend.md)). Cross-origin, that host
must send `Access-Control-Allow-Origin`: the globe reads the raster back from a
canvas. If the rasters are missing or blocked, the map draws a flat sea and hides
the depth switch.

The bundle requests rasters and atlas with `?v=<hash>`, a content hash computed
in `vite.config.ts` at build time, so nginx can cache them as `immutable`. Use
the same suffix for any new fetched asset.

### Credit

GEBCO's terms require acknowledging the source. The attribution line links to
the grid page while the depth layer is on, and `src/frontend/THIRD-PARTY-NOTICES.md`
carries the citation and the three conditions. Keep both.

## Basemap and labels

`just map::atlas` writes both atlas files. Geometry is world-atlas 50m; names
(English and German) and label ranks come from Natural Earth. Ranks are remapped
onto the camera's k 1-9 range, so the world view shows continents and oceans and
countries and seas appear on zoom. Each ocean name is drawn once, not once per
polygon.

## Pins

Pins stay on their coordinates. Clicking a cluster zooms to max zoom, where pins
that still overlap fan out around their centroid; they fold back below it.
Opening a clustered pin (e.g. from a `?pin=` link) does the same and frames its
fanned position. The host organisation is drawn last, with its logo.

On mobile the camera starts closer and caps zoom to the screen size, hit-testing
falls back to the nearest pin within a touch radius, and a filter change frames
its results in the map area left between the chips and the sheet.
