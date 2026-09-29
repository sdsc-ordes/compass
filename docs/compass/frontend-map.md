# The Map

Two views of one dataset: a flat **Equal Earth** projection (the default) and
an orthographic **globe**. Equal Earth is equal-area, so regions compare fairly by
size, while keeping familiar shapes (Šavrič, Patterson & Jenny, 2018). Both are
drawn by `d3-geo` — SVG for land, borders and labels, canvas for the pins and the
depth raster. There is no MapLibre: the design
needed full control of every mark — how countries are filled, outlined and
labelled, for example — and the price is hand-rolled gestures,
hit-testing and fanning in `src/lib/projection.ts` and `src/lib/pins.ts`.

Everything the map draws is **generated ahead of time and committed**, so a fresh
clone renders without network and the built widget contacts no third party at
runtime. The heavy assets — atlas and rasters — are fetched from `tileurl` beside
the bundle rather than built into it. `just check::frontend-standalone` enforces that second part.

| Asset | Built by | In git? |
| --- | --- | --- |
| `public/basemap/atlas.json` (fetched), `src/atlas-labels.json` (bundled) | `just map::atlas` | yes |
| `bathy/flat.webp`, `bathy/flat-small.webp`, `bathy/equirect.webp` (~6 MB) | `just map::bathymetry` | yes |
| `bathy/d/` detail tiles (~20 MB) | `just map::bathymetry-detail` | **no** — deploy step |
| `tiles/` GEBCO pyramid (~53 MB) | `just map::tiles` | **no** — build input only |
| Self-hosted Cabin faces, base64 in `src/styles/fonts.css` | `just map::fonts` | yes |

## Bathymetry

Real ocean depth on an ocean map. The imagery is the **GEBCO_2026 Grid**, fetched
once as tiles and baked into rasters the widget can draw cheaply.

### How it is made

```
GEBCO WMS  →  tiles/z0-5 (jpg)  →  Web Mercator mosaic  →  flat.webp
                                                        →  equirect.webp
                                                        →  d/{c}_{r}.webp
```

`scripts/build-tiles.mjs` fetches z0–z5 at 512 px from GEBCO's WMS.
`scripts/build-bathymetry.mjs` stitches z5 into one Mercator mosaic and
reprojects it. The bake needs z5; a shallower fetch is not enough.

**Two rasters, because there are two kinds of motion.** Flat pan and zoom are an
exact similarity transform of a fixed image, so `flat.webp` is pre-projected into
Equal Earth and every frame is a single `drawImage`. Rotation is the one
transform that is not affine, so the globe resamples per frame from
`equirect.webp` (plate carrée) under a frame budget.

**A small base for phones.** `flat-small.webp` is the same image at 2048 px
(0.3 MB against 4.4). A stage drawing the sphere at no more device pixels than
that starts on it and fetches the full base only once zoomed past it; Save-Data
stays on it. `SMALL_W` in `src/lib/bathymetry.ts` must match the bake's
`FLAT_SMALL_W`.

**A 2× detail level, lazily.** Past 1:1 — about k 4 — the flat view upscales the
base, so `d/` tiles are fetched only for the part of the viewport being looked
at. A tile still in flight, or one the bake skipped, simply leaves the base
showing. It is gitignored: ~20 MB of binary git cannot delta-compress, and only
deep zoom reads it. **Run `just map::bathymetry-detail` before `just deploy`** or
the deployed map stays at base resolution.

### Decisions worth not re-arguing

- **The WMS request is pinned to `GEBCO_2026`.** `GEBCO_LATEST` rolls onto the
  next annual grid by itself, which would change the imagery under us silently.
- **Saturation is cut to 0.6.** GEBCO's own ramp is far more vivid than the
  five-colour palette and fought the pins for attention.
- **The poles are smeared, not left empty.** Mercator stops at 85.05°, so the
  source has nothing for the last ~5°. Unwritten pixels are black, and the globe
  samples bilinearly — a gap there pulled a dark ray out of the pole. Carrying
  the outermost row up reads as ice instead.
- **A light unsharp (0.5) is baked in.** Deep zoom upscales past 1:1, where plain
  interpolation reads as mush.
- **The base rasters are committed, the detail level is not.** A clone gets a working
  map; a deploy gets the extra 20 MB.

### Updating the imagery

```bash
just map::tiles              # ~53 MB from GEBCO, network, cached between runs
just map::bathymetry         # rebake the committed pair (no network)
just map::bathymetry-detail  # the same, plus d/ — before a deploy
```

Then commit `bathy/flat.webp`, `bathy/flat-small.webp` and `bathy/equirect.webp`. The detail bake needs a
large heap (it goes through a 16384² mosaic); the recipes already pass the flag.
`BATHY_Q`, `BATHY_SAT` and `BATHY_SHARPEN` override quality, saturation and
sharpening without editing the script.

### At runtime

The rasters are served from `tileurl` (see
[Frontend configuration](configuration-frontend.md)). Embedded on another origin,
that host **must** send `Access-Control-Allow-Origin`: the globe reads the raster
back off a canvas to reproject it, and a tainted canvas cannot be read. If the
rasters are missing or blocked the map falls back to a flat sea and hides the
depth switch rather than failing.

### Credit is a licence condition

GEBCO's terms require acknowledging the source. The sidebar credit links the grid
page and `src/frontend/THIRD-PARTY-NOTICES.md` carries the citation and the three
conditions. Do not drop either.

## Basemap and labels

`just map::atlas` writes both atlas files: the geometry is world-atlas 50m
(already simplified — the stage only needs a shape and a point to hang a name
on), and Natural Earth supplies the names, in English and German, plus each
label's rank. Those ranks are remapped onto our k 1–9 camera so the world view
shows continents and oceans, and countries and seas arrive as you zoom. Ocean
names are drawn once, not once per polygon.

## Pins

Pins stay on their coordinates. Clicking a cluster zooms straight to max zoom,
and only there do pins that still overlap fan out around their centroid; they
fold back below it. Opening a pin that is still clustered (from a `?pin=` link,
say) does the same and frames its fanned spot. OceanCare is drawn last, with its
logo, on top of the rest.

On mobile the camera starts closer and caps its zoom to the screen, hit-testing
falls back to the nearest pin within a touch slop, and a filter change frames
its results in the map left visible between the chips and the sheet.
