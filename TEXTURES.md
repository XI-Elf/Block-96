# Block-96: texture guide for other neural networks / artists

Version v61. Source of truth: `game.js` (`TEX`, `TEXMEAN`, `texFill`, `bakeTile`, `prism`), `modules/interiors.js`, `modules/characters.js`.
Everything lives in `assets/` next to `index.html`. The path prefix comes from `window.B96_ASSET_BASE` (set in `index.html`, default `assets/`).

## 1. Units and projection (read this first)

- World: **10 px = 1 m**. A person is 1.8 m = 18 world px. The whole city is about 2.9 x 1.9 km.
- Camera: 2D isometric on canvas (no three.js). Ground = rotation by 45 deg + vertical squash 1:2 (a 30 deg look-down). One metre of height = `VMh` screen px (about 0.866 x `SC`, `SC` = 26..64 px depending on window width). A 1.8 m person is about 60 px tall at 1280 px width.
- Light: fixed from the upper left, `LIGHT = {x: 0.7, y: 0.42}`. Wall faces are multiplied by `0.55 + 0.45 * dot(normal, light)`. **Do not bake directional light or cast shadows into tiling textures** (they would repeat and double up with the game shading). Contact shadows under props are drawn by the game as dark ellipses.
- Night: the whole screen gets `rgba(4,9,30, 0.5 * nightK)` and street lamps add warm radial pools (radius about 17 m). The raid starts at 00:00, so most players see the night look. Textures should read well when dark and desaturated.
- Style: Ukrainian city, 2003, winter, after a catastrophe. Panel blocks and the look of the 2000s only. Muted, dirty colours (grey, green-grey, rust, frozen earth), snow patches, point neon only (tiny signs, LEDs). No fantasy, no sci-fi gloss, no modern anachronisms.

## 2. Texture inventory

All are PNG. "Tile" = must tile seamlessly in both directions. Sizes are the current files.

| File | Size | Type | Used for |
|---|---|---|---|
| `asphalt.png` | 512x512 RGB | tile | road surface |
| `concrete.png` | 512x512 RGB | tile | base ground between everything (yards, empty land) |
| `earth.png` | 512x512 RGB | tile | parks, green areas (frozen earth) |
| `pave.png` | 512x512 RGB | tile | sidewalk slabs along roads |
| `roof.png` | 512x512 RGB | tile | all building roofs |
| `wall.png` | 292x240 RGB | tile | wall faces of every building (no windows, no doors) |
| `floor.png` | 512x512 RGB | tile | interior floors (inside enterable houses) |
| `rust.png` | 512x512 RGB | tile | loaded but **not drawn right now** (reserved for metal: garages, fences) |
| `props.png` | 1774x887 P (indexed, alpha) | sprite sheet 4x2 | street props, see 2.2 |


Mean colour of each tile matters (see section 4, `TEXMEAN`): asphalt [66,73,72], concrete [134,139,130], earth [69,76,62], roof [75,84,81], wall [120,116,105], pave [50,52,50], floor [128,128,128].

### 2.1 How each tile is applied

`texFill(ctx, name, alpha, sc, M, rule, ox, oy, base, gain)` clips to the current path, fills with a repeating pattern of the texture scaled by `sc`, then **multiplies** by `base / TEXMEAN[name]` so the texture carries only *structure* and the colour comes from the game palette (`base`). Pattern is anchored to world coordinates (stays glued to the map while the camera moves).

| Texture | Where | Scale (`sc` = world px per texture px) | Metres per tile | Projection | Colour rule |
|---|---|---|---|---|---|
| `concrete` | bottom layer of every 400x400 world-px ground tile (`bakeTile`) | 0.20 | 10.2 m | top-down, drawn in ground space then iso-transformed with the tile | `base #2a3640`, gain 1.15 |
| `earth` | parks, over `#244033` | 0.20 | 10.2 m | same | `base #2c4a3a` |
| `asphalt` | road polygons, over `#3b4650` | 0.16 | 8.2 m | same | `base #46525d` |
| `pave` | sidewalk: stroked band 7 m wide around each road polygon, raised 15 cm; tinted once by `paveTint()` (multiply `rgb(230,255,255)`, then add `rgb(40,52,60)`) | 0.13 | 6.7 m | same | tint above |
| `roof` | building roof top | 0.16 | 8.2 m | projected onto the roof plane with `worldM(heightPx)` | `base = building roof colour`, then a snow overlay `rgba(226,238,246,0.55)` |
| `wall` | each visible wall face of a building prism | horizontal: 292 px = 3.6 m of wall; vertical: 240 px = 3.1 m (one storey) | 3.6 x 3.1 m | frontal, mapped onto the face with a 2D affine transform (along the wall, up) | multiplied by building colour / `TEXMEAN.wall`, then lit by `LIGHT` |
| `floor` | interior rooms (`modules/interiors.js`) | 0.05 | 2.6 m | screen-aligned overlay (not iso-projected), `overlay` blend, alpha 0.35 (bath, kitchen) or 0.55 | none |

Ground tiles are baked once into 1000x1000 canvases (`TS=400` world px, `TG=2.5` canvas px per world px) and cached, so a texture is sampled at roughly 2.5 / sc canvas px per texture px.

Layer order on the ground (bottom to top): concrete base, soft light blobs, parks (earth), weeds/shrubs (procedural strokes), water (flat `#1b3856`, procedural), roads (side face of the kerb, sidewalk slabs, asphalt, kerb shadow, kerb highlight), railway (procedural), markings (procedural). Then buildings: wall faces (wall.png x building colour), optional procedural decoration (windows, doors, balconies from `interiors.js`/`o.deco`), roof (roof.png) and snow overlay. Then props and actors.

### 2.2 `props.png` sprite sheet

4 columns x 2 rows, transparent background (indexed PNG with alpha). Cell rectangles `[x, y, w, h]` are hard-coded in `game.js` (`BOX.props`), so a replacement sheet must keep either the same 1774x887 layout or the new rectangles must be written into `BOX`:

| Index | Rect | Object | Used |
|---|---|---|---|
| 0 | [66,9,322,427] | birch tree, winter | yes, 65% of trees, height 7..11 m |
| 1 | [610,10,195,425] | street lamp with a bent arm | yes, height 7.5 m, the lamp light is drawn by the game |
| 2 | [938,42,342,382] | wheeled dumpster | no (reserved) |
| 3 | [1382,70,360,339] | wooden crate | only with debug flag `B96_CARSPRITE` |
| 4 | [30,461,387,425] | shelf rack with sacks | only with debug flag |
| 5 | [470,484,402,368] | park bench | no (reserved) |
| 6 | [1042,449,150,427] | wooden utility pole | no (reserved) |
| 7 | [1434,446,235,434] | bare tree | yes, 35% of trees |

Sprite rules: pre-rendered **isometric** (camera yaw 45 deg, pitch 30 deg, same as the game), light from the upper left, object standing on the ground with the **bottom centre of its alpha box on the ground contact point**, no baked ground shadow, no ground plane, neutral weathered colours (the game adds night tint). Placed by height in metres (`MH(h)`), width follows the aspect ratio.

### 2.3 What is drawn **without** textures (procedural, do not make textures for them)

- **Cars and trucks**: `modules/vehicles-phys.js` (physics) + `modules/vehicles-draw.js` (prisms and primitives: body, glass, wheels, lights, mirrors). Four types: sedan, niva, van, truck. Colours come from a paint palette in code.
- **Bridges**: `modules/bridges.js`, data in `bridges-data.js` (deck, railings, piers as primitives).
- **People and mobs** (player, gang members, ППС, civilians, dogs): `modules/characters.js`, a vector rig drawn per frame from `STYLES` (colours, hat type, accent). The old sprite sheets `people.png` and `young_*.png` exist in `assets-v03/` but are switched off (`SPR.on = false`).
- **Buildings' shapes**: prisms from the map data (`world15.js`). Facade decoration (windows, doors, balconies, entrances) is drawn by `interiors.js` per face.
- **Water, railway, road markings, weeds, snow, lamps' glow, fog, vision cone, HUD**: canvas code.

Gang outfits (concept reference for artwork, colours are in `STYLES` of `characters.js`): Холодногорские red anorak + white stripe, Вышка black quilted jacket + red lamp, Бригада olive pea coat + miner helmet, Кооператив black leather jacket + yellow accent, Казанские long black leather coat + fur hat, Собор black rubber cloak + hood + gold, Сектор green bomber + camo + white laces, Чердак black hoodie + violet accent, без банды grey worn jacket + cap.

## 3. Prompt templates (for an image generator)

General style block, paste into every prompt:

> STYLE: Ukrainian city, year 2003 (panel blocks, 2000s look), deep winter, seven years after a catastrophe. Muted, dirty, desaturated palette (grey-green, rust brown, cold blue-grey), frozen and weathered surfaces, no gloss, no sci-fi, no modern branding, no text. Point neon only if the object is a sign (tiny, cyan or magenta). Flat even lighting, no cast shadows, no directional highlights, no vignette, no perspective.

Tileable textures (all: square, **seamless in both directions**, top-down orthographic, evenly lit, no large unique features that would reveal the repeat, output PNG RGB):

- **asphalt.png** 512x512: "Seamless tileable top-down texture of cracked, patched wet asphalt, dark blue-grey, fine gravel grain, a few hairline cracks and tar patches, thin frost. Mean colour about RGB 66,73,72. [STYLE]"
- **concrete.png** 512x512: "Seamless tileable top-down texture of old pale grey concrete slab ground, stains, faint vertical rain streaks, small cracks, dust. Mean RGB about 134,139,130. [STYLE]"
- **earth.png** 512x512: "Seamless tileable top-down texture of frozen dark earth with dead grass and thin snow crust, mottled, green-brown. Mean RGB about 69,76,62. [STYLE]"
- **pave.png** 512x512: "Seamless tileable top-down texture of old concrete paving slabs with dark joints, moss in the joints, chipped edges, dirty grey. Mean RGB about 50,52,50. [STYLE]"
- **roof.png** 512x512: "Seamless tileable top-down texture of a flat panel-building roof: bitumen roofing felt in strips, patched seams, rust stains, a little snow dust. Mean RGB about 75,84,81. [STYLE]"
- **floor.png** 512x512: "Seamless tileable top-down texture of worn apartment floor: faded linoleum or parquet, scuffed, neutral mid grey (mean RGB 128,128,128) because it is drawn as an overlay. [STYLE]"
- **rust.png** 512x512: "Seamless tileable texture of corroded painted sheet metal, orange-brown rust bleeding through peeling green paint. [STYLE]"

Wall (frontal, not top-down), 292x240 (aspect 1.22), tileable horizontally and vertically, **no windows, doors, or signs** (the game draws those), one storey high (about 3.1 m x 3.6 m):

- **wall.png**: "Seamless tileable front view of a stained prefabricated concrete panel wall of a panel apartment block: faint panel seams, peeling paint, rust streaks running down, chipped plaster, dirty cream-grey. Mean RGB about 120,116,105. [STYLE]"

Sprite sheet `props.png` (1774x887, transparent background, 4x2 cells as in 2.2): generate each object separately and compose:

- Common line: "Isometric view, camera yaw 45 degrees, pitch 30 degrees, light from the upper left, single object on a fully transparent background, bottom centre of the object touches the ground, no ground shadow, weathered realistic materials, 2003 Ukrainian street. [STYLE]"
- Objects: leafless birch tree with frost; steel street lamp on a concrete pole with a bent arm and a dull sodium lamp head; green wheeled waste container with a plastic lid; wooden crate with steel straps; metal shelf rack with sacks and boxes; park bench with iron cast legs and wooden slats; wooden utility pole with ceramic insulators; bare poplar tree.

## 4. Replacing a texture without breaking the game

1. **Keep the file name** and put it into `assets/` (or point `window.B96_ASSET_BASE` in `index.html` to another folder). Do not rename: the names are hard-coded in `game.js` (`TEX` list).
2. **Tile size may change** (it need not be 512 or a power of two), but the metres-per-tile in the table in 2.1 then changes. Either keep the same size, or compensate the scale in `game.js` (`sc` argument of `texFill`, `0.2 / 0.16 / 0.13 / 0.05`; for `wall.png` the constants `36 / 292` and `/ 240` in `prism`).
3. **Match the mean colour** listed in `TEXMEAN` (`game.js`), or update `TEXMEAN` to the new mean. The game multiplies by `base / TEXMEAN`; a much brighter texture makes the world too bright or clipped, a much darker one makes it black.
4. The texture must be **seamless** and carry only structure (no light direction, no shadows, no unique landmarks), or the repeat and the pattern become visible.
5. `props.png`: keep the alpha channel and the cell rectangles of `BOX.props` (or edit `BOX`). Keep the bottom-centre anchor.
6. Check: open `index.html?hour=12` (day) and `index.html` (night, default 00:00), walk along a road, a park and a panel block, zoom the browser to 80% and 125%. Look for visible seams, grid-like repetition, colour shift against neighbouring tiles, and flicker.
7. Size budget: the full game bundle is served as a static site; keep each texture under 1 MB.
8. Never put text, logos or watermarks into any texture.
