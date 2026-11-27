# Visual V2 control scenes (V1 vs V2 comparison)

Purpose: fixed, repeatable frames so that Visual V1 and Visual V2 can be compared on identical state. Plan reference: `docs/BLOCK96_DEVELOPMENT_PLAN.md`, stage v76 and the "Control scenes" list.
S.T.A.L.K.E.R. and Project Zomboid are mood references only. Nothing from them is used as an asset.

## 1. Blocking prerequisite: the build is not deterministic yet

- [VERIFIED] `game.js:27` seeds a new world with `Date.now() % 2147483647`. The same seed cannot be requested today, so two runs produce different buildings, containers and NPCs.
- [VERIFIED] Start hour can already be set by URL: `?hour=22` (`game.js:30`).
- Missing and needed (code change, **not made here**): a `?seed=N` override, a fixed start point `?at=x,y` (metres), a way to freeze weather/snow noise, and `?scene=ID`.
- Until that exists, scenes can be defined but not reproduced. Capture is manual only.

## 2. Common capture rules

| Parameter | Value |
|---|---|
| Camera | current isometric 3/4 projection, unchanged; default start zoom; no right-mouse shift |
| Resolution | 1920x1080 at DPR 1 (desktop). Phone pass: 390x844 CSS px at the device DPR, same scene |
| Player | male, no gang, standing, weapon holstered unless the scene says otherwise; HUD visible in one frame and hidden in a clean frame |
| Population | scene-specific NPCs placed by script; others despawned within 60 m for readability, with a second unmodified frame |
| Seed | one fixed value `S0`, chosen once and recorded in the report, then never changed |
| Output | PNG stills (lossless), 10 s clip at 30 fps for scenes that move, same filenames for V1 and V2 with suffix `_v1`, `_v2` |
| Report per frame | build id, seed, hour, coordinates, device, DPR, FPS P50/P95/P99 over the clip, heap, V1/V2 mode flag |
| Not allowed | changing camera, scale, NPC counts, balance or collision to improve a frame |

## 3. Scenes

Coordinates are metres in the world frame (2918 x 1946 m). District anchors come from `world15.js`; building choices inside them are rules, to be frozen to exact coordinates in v76.1 once seeding exists.

### S1. Day street and facades (winter, wear)
- Hour: 12:00, overcast, snow patches.
- District: Pavlov Yar, anchor (1051, 617), a residential street with panel blocks on both sides, sidewalk visible.
- Frame: straight street segment of about 60 m, two facade types, a parked car, a lamp, a bin group.
- Checks: asphalt wear and cracks, sidewalk edge, facade module variety, snow/ice, no visible tile repetition at default zoom, silhouette readability of obstacles.

### S2. Night courtyard (lamps and shadows)
- Hour: 00:00, the default raid start. Variant S2b at 22:00.
- District: Derbyshevka, anchor (1532, 591), a courtyard enclosed by blocks, at least two lamps, a parked car, containers, a low wall.
- Frame: player near a lamp pool, one shaded corner behind an obstacle, one NPC standing in the dark just outside the view cone (light must not reveal hidden NPCs).
- Checks: ambient plus local lamp masks, light blocked by opaque walls, no double darkening, contact shadows, tactical visibility unchanged between V1 and V2 (compare detected-NPC lists).

### S3. Interior, residential
- Hour: 19:00 (warm interior light, cold exterior).
- Building: a panel block, entry flat on the first floor nearest the Pavlov Yar anchor; kitchen, corridor and a room visible.
- Frame: player enters through the door; second frame in the room centre.
- Checks: floor materials (linoleum, parquet, tile), furniture matches room purpose, passages unchanged, decor adds no loot or collision, interior-vs-exterior light separation.

### S4. Interior, commercial or civic
- Hour: 14:00.
- Building: a municipal building with a sign (post, clinic or school) in Pavlov Yar or Sormovka (anchor 1336, 335).
- Frame: entrance hall and a counter or waiting area.
- Checks: readable purpose, sign legibility, passable layout, shadow under furniture.

### S5. Depot / industrial firefight
- Hour: 01:00.
- District: Kompressorny, anchor (2123, 660), administration-controlled industrial zone; fallback Novozavodskoy (610, 1763). Pick a warehouse yard with containers.
- Setup: scripted and identical every run: one player, three hostile NPCs at 20 to 30 m behind cover, rifle fire for 10 s. Do not change AI parameters; use fixed spawn positions and a short deterministic command sequence.
- Checks: muzzle flash, tracers, hit feedback, directional light and smoke if enabled, readability under fire, frame time P95/P99 during fire (heaviest case).

### S6. Water and bridge edge (optional, only if Visual V2 touches water)
- Hour: 07:00, dawn. Any of the 7 bridges, for example the one nearest Rechnoy Port (2336, 1601).
- Checks: shoreline, bridge materials, road-to-bridge seam.

## 4. Comparison protocol

1. Freeze the baseline: V1 frames on the commit that introduces the toggle.
2. Capture V2 on the same seed and state.
3. Side-by-side sheet per scene plus the performance row above.
4. Acceptance per the plan: owner approves by frames and video; mobile budget met or a compromise agreed; V1 stays available as rollback.
5. The owner's two reference videos are compared by eye only and are never committed to the public repository.

## 5. What is not verified

- [VERIFIED] World size, district anchors, the `?hour=` parameter and the non-deterministic seed come from the v75 build.
- [UNVERIFIED] That every named frame position contains the listed objects (lamps, two facade types, civic sign). Nobody has run the game to confirm; this needs the seed override and a visit.
- [UNVERIFIED] Phone performance, since no measurement exists.
