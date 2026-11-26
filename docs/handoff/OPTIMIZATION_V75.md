# v75.3–v75.9 — geometry and rendering checks

All measurements below use the v73 city with the v74 test fixes. Seed 31337 was used for geometry and ray queries. Changes were made without reducing the map, population, or gameplay visibility. Hardware GPU timing and mobile frame timing remain unmeasured.

## v75.3 — collision inventory

`WL_SIM.newWorld(31337, null, [], 'pavlov_yar')` produced 502,251 wall records and 14,211 spatial-grid cells. By kind, the largest groups were `wall` 198,503, `bldg` 143,993, `door` 57,138, `win` 43,251, and `furn` 41,591. Of the `bldg` records, 120,365 are chain members and 23,231 carry original polygon metadata. Of the `wall` records, 182,506 are chain members. Door records are mutable and referenced by door objects. Some drawing code also uses wall indices directly. The large count is mainly the representation of rotated outlines as chains of short axis-aligned rectangles.

## v75.4 — compatible segment merge

An exact adjacency scan of static, unchained rectangles with matching kind, building ID, interior ID, low/fly flags, colour, x, and width found 9 vertically joinable pairs. Merging those pairs would remove less than 0.002% of all wall records, while requiring spatial-index updates. Rotated chains cannot be replaced with one bounding rectangle without changing collision shape. Door records and directly indexed drawing chains need identity preservation. No merge was applied because the measured safe opportunity would add complexity with negligible benefit.

## v75.5 — TypedArray experiment

An in-memory copy of all 502,251 records stored four coordinates as `Float64Array`, building IDs as `Int32Array`, and kind/flags as `Uint8Array`. Those arrays used 19,085,538 bytes and exactly matched the copied coordinates and building IDs. `Float32` changed 1,470,911 coordinate values, with maximum absolute error about 0.00098 world pixels. This copy omits the 75,481 original polygon references, object identity, and other metadata required by current callers. Copying into arrays raised process RSS by about 19.7 MiB while the original objects remained. A runtime replacement needs a compatible access layer and collision corpus before it can claim memory savings; this experiment did not change game storage.

## v75.6 — ray queries

`sim.js` now scans the spatial grid directly for `rayWall` and `rayWallAll`, avoiding the temporary array from `wallsNear`. `wallsNear` remains available for its existing callers. A deterministic corpus of 10,000 rays for each query type is in `tests/benchmark-rays.js`.

| Result | Before | After |
| --- | ---: | ---: |
| Median of three warm samples | 1,366 ms | 1,287 ms |
| SHA-256 of all returned hit distances | `b7394e787444fe4a33dad1fa5ed8061789da27139b5d70e0a7ba96d16c5ead6a` | Identical |

The reduction is about 5.8% for this ray-query microbenchmark on the cloud host. It is not a measured whole-frame improvement.

## v75.7 — static graphics cache

`game.js` already bakes static terrain into 400-world-pixel canvas tiles at 1.5 pixels per world pixel, keeps up to 12 tiles, and evicts the least recently used tile. The current 1280 × 720 viewport covers fewer than 12 such tiles in the tested camera configuration. No additional cache was introduced. Baking and cache reuse on other viewports and during travel remain candidates for browser profiling.

## v75.8–v75.9 — fog and light layer resolution

The visual fog and lamp-light canvases now use one backing pixel per CSS pixel when the main canvas uses a higher device pixel ratio. At DPR 1.5, each offscreen layer changes from 1920 × 1080 to 1280 × 720, reducing its pixel area by about 56%. At DPR 1, layer dimensions remain unchanged. This is adaptive to device pixel ratio and canvas size, not to a guessed frame-rate threshold. `window.B96_FOG_SCALE` and `window.B96_LIGHT_SCALE` can be set to 1 before loading the page to compare full-resolution layers.

The fog change rescales only the visual overlay. `WL_VISION.mobSees`, `playerSees`, and the simulation's line-of-sight checks remain at their original precision. In headless Chromium at DPR 1.5, two full-resolution fog samples averaged 1.93 and 2.30 ms per call; two adaptive samples averaged 1.49 and 1.57 ms. The software renderer and small sample counts limit this timing comparison. Screenshots of the same seeded night scene were inspected at both resolutions with no missing light or fog layers and no page script errors. A real-device visual and GPU profile is still required before a mobile performance claim.
