# Block-96

Top-down / isometric (3/4) extraction shooter with RPG elements, written in plain JavaScript (no build step, no framework). Setting: the city of **Chertokamen** in 2003, seven years after a catastrophe in 1996 that sealed it off. Aesthetic: panel-block housing and the 2000s. The game is Ukrainian: signs and texts are Ukrainian/neutral, and no real-world geopolitical references are used anywhere (code, prompts, docs).

This README is written so that a reader (human or AI) with **no prior context** can understand, run, modify and test the project. Statements are verified against release `v74` unless marked `[unverified]`.

| Build | Version |
| :--- | :--- |
| Current source | **v74** (`release/block96-js-v74.zip`, source of truth) |
| Public site | v73 (https://block96-js.vercel.app); v74 not deployed yet |

---

## 1. Quick start

```
# run: open index.html in a browser (needs no server for most features)
# headless simulation tests (Node >= 18):
B96_ROOT=<path to the unpacked release> node tests/gangs.test.js
B96_ROOT=<path to the unpacked release> node tests/behavior.test.js     # slow (> 100 s)
B96_ROOT=<path to the unpacked release> node tests/extras.test.js
# single-file build (all scripts inline, textures as data URIs):
python3 newmap/tools/build_single.py <release dir> <out.html>   # script lives in the project folder, not in the release zip
```

* Tests use `tests/harness.js`: it loads the game scripts into a Node `vm` context with a fake `window`/`document` and exposes `boot({hour, home, seed, at})` returning `{w, S, s, p, step(sec, cmd)}`.
* `B96_ROOT` must point at the directory that contains `config.js`, `sim.js`, ... (the harness default path is a leftover from the author's machine).
* Deploy (public site): Vercel project `block96-js`; deploy a copy of the release from its own folder. Deploys are done only from the owner's PC and only with the owner's explicit permission.

## 2. Architecture

**Plain scripts, global namespaces, no bundler.** `index.html` loads scripts in this exact order (order matters; each file attaches `window.WL_*` / `window.B96_*` globals):

1. `config.js` (`WL_CONFIG`) -> `modules/vehicles-phys.js`, `modules/vehicles-draw.js`
2. `world15.js` (`B96_WORLD`, the baked map) -> `road_network.js` -> `modules/bridges-data.js`, `modules/bridges.js`
3. `nav.js` (grid + A*) -> `modules/interiors_sim.js` -> `sim.js` (`WL_SIM`)
4. `behavior/factions.js` (`WL_BEH`) -> `enemies.js` (`WL_ENEMIES`) -> `player.js` (`WL_PLAYER`) -> `hud.js` (`WL_HUD`) -> `feel.js` -> `threat.js`
5. `modules/vision.js` (`WL_VISION`) -> `behavior/extras.js` (`WL_BEH_X`)
6. client-only: `modules/vehicle-view.js`, `characters.js`, `graffiti.js`, `interiors.js`, `start.js` (`WL_START`), `map.js`, `shop.js`, then `game.js`.

**Simulation / client split.** `sim.js` is a deterministic, DOM-free simulation: state object `s` + `WL_SIM.step(s, inputs, actions, dt)`; commands go in, events (`s.events`) come out; randomness only through the seeded RNG (`API.rnd/rr/ri`, `s.rng`), never `Math.random`. `game.js` is the client: input, rendering (2D canvas, isometric 3/4), HUD, audio, save. `enemies.js`, `player.js`, `vision.js`, `behavior/*` must stay DOM-free so tests can run them in Node.

**Module contract.** Modules replace parts of the sim through globals: `window.WL_ENEMIES = { step(s, dt, API), ... }`, `window.WL_PLAYER = { step(s, p, cmd, dt, API) }`, `window.WL_HUD = { update(s, p, ctx) }` (return `false` to fall back to the built-in HUD). `WL_SIM.builtin.stepEnemies/stepPlayer` stay callable so a module can wrap them. `WL_SIM.API` exposes: `damage, collide, freeSpot, los, rayWall, rayWallAll, wallsNear, fire, spawnEnemy, derived, weaponStats, attachMods, invCount/invAdd/invTake, rnd/rr/ri, clamp, zoneAt, initCars, carById, toggleCar, damageCar, setDoorCells`.

**Ownership rule (parallel work).** One builder owns `game.js` and `sim.js`; other work is delivered to the builder as exact changes. New data goes in new keys; existing keys are not renamed.

**Units.** 1 m = 10 world px (`WORLD.pxPerM`); sim collision uses rows of rectangles; building footprint cell 2 m. Player is 1.8 m; hit circle r = 12 px; floor height 2.8 m.

## 3. File map

| Path | Role |
| :--- | :--- |
| `index.html` | Script order, HTML overlays (help, gang pick, warehouse/prep, inventory, character) |
| `config.js` | All balance/data: `WEAPONS, MELEE, ATTACH, ITEMS, CONTAINERS, ENEMIES, CITY, SPAWN, STATS, SKILLS, ABILITIES, XP, NEEDS, STAMINA, START, META` |
| `world15.js` (~1 MB, generated) | `window.B96_WORLD`: the baked city (see 4.1) |
| `road_network.js` / `.json` | Canonical editable road source (road raster, samples, district polygons); `districtRoads(id)` derives per-district rasters |
| `nav.js` | Navigation grid + A* for mobs |
| `sim.js` (~107 KB) | `newWorld`, `genWorld/genCity`, player/bullet/car steps, API |
| `enemies.js` (~83 KB) | Mob types (`TYPES`), spawning per district (`ZONE_SPAWN`), squads (`MAX_SQUAD = 3`), `nightPressure`, stances (`stanceOf`), `FACTIONS` |
| `behavior/factions.js` | `WL_BEH`: clock (`CLOCK`), relation matrix, gang profiles, spawn tables, `NIGHT_MULT = 1.5`, `isDay`, `returnHome` |
| `behavior/extras.js` | Gang-vs-gang fights, tripwires, shield, smoke, petards, molotov, door locking, door noise |
| `player.js` | Player movement/combat step (`WL_PLAYER`) |
| `modules/vision.js` | Shared field-of-view cones for player and mobs, grey-map fog |
| `modules/start.js` | Gang pick screen, `GANGS`, `START_HOUR = 0`, district list, gender pick |
| `modules/map.js` | Full-screen city map (key `M`) |
| `modules/shop.js` | Shelter trader/stash UI |
| `modules/characters.js` | Procedural character rig and gang outfits |
| `modules/vehicles-*.js`, `vehicle-view.js` | Car physics, drawing, cones/mirror view |
| `modules/interiors*.js` | Procedural interiors (sim side + drawing) |
| `modules/bridges*.js` | Bridges built from primitives |
| `modules/graffiti.js` | Facade graffiti (original placeholder texts, `assets/graffiti_quotes.json`) |
| `feel.js`, `threat.js`, `hud.js` | Game-feel effects, threat indicator, HUD |
| `assets/*.png` | Textures (see `TEXTURES.md` for the generation guide) |
| `tests/` | `harness.js`, `gangs.test.js`, `behavior.test.js`, `extras.test.js`, `census.js` |
| `CHANGES_V69..V74.md`, `*_NOTES.md` | Per-version change logs |

Project-side (outside the release zip): `map-sync/game-edits.json`, `newmap/` (map editor export + generator scripts `b3_*.py`), `tools/` (older generators), `newmap/tools/build_single.py` (single-file build), `texture-prompts/`.

## 4. Data formats

### 4.1 `window.B96_WORLD` (world15.js)
Coordinates are in **map pixels** (1 px = `mPerPx` = 1.9 m); the world is 1536 x 1024 px = 2918 x 1946 m. Keys:
* `name, mPerPx, w, h, chunk (48), up (4)`
* `water`, `rail`, `road`: objects keyed by chunk `"cx,cy"` -> list of polylines (flat `[x0,y0,x1,y1,...]`)
* `park`: same keyed form for park polygons
* `bridges`: `[{pts:[[x,y],[x,y]], w, wa, wb}]` (7)
* `blockposts`: administration checkpoints (6)
* `buildings` (1837): tuple `[cx, cy, width, depth, height_m, kind, angle_deg, sub]` where `kind` is one of `house` (1168), `panel` (284), `garage_row` (245), `civic` (67; `sub` = school / kindergarten / clinic / post / admin / police / library / council), `warehouse` (58), `industrial` (15)
* `districts` (16): `{id, n, name, kind, anchor, poly}`; `districtRle`: run-length raster of district numbers
* `roadSamples`: `[x, y, dx, dy]` points along roads (used for lamps, spawn along streets)
* `userObjs`: `[type, x, y, angle]` -- trees, containers, cars, bins placed by the generator or the user

### 4.2 Map editor format `block96-city-map` v1 (`newmap/city-map.json`)
`{format, version:1, units:'m', world:{w:2918,h:1946,metersPerPixel:1.9}, bg, nextId, districts:[...], features:[...]}`. A feature is `{id, k, t, ...}`: `k:'line'` (`t`: river, rail, highway, road, street; `pts`), polygons for zones (residential, industrial, public, forest/park/garden/swamp, wasteland), `bld` (buildings), `obj` (objects). **The user draws the map in the editor; their JSON is the base of the map and must not be overwritten.**

### 4.3 `map-sync/game-edits.json` (game -> editor sync)
`{format:'block96-city-map', version:1, units:'m', world, features:[...], removed:[], moved:[], removed_bld:[], flagged:[]}`. Every feature produced by the game has `src:'game'` (e.g. `{id:'g1', src:'game', k:'bld', t:'school', x, y, w, d, rot, fl}` or `k:'obj'`, `t:'tree'|'container'|'car'`). Rule: any change to the map made in the game must be written here; user-drawn features are never erased; conflicts go to `flagged`, never deleted.

### 4.4 Save (`localStorage`)
Key `wastland.save.v1` (historical name, **do not change**, otherwise players lose saves), `{v:1, ...}`: stash, character, stats. Gang choice is stored under a separate key in `start.js`.

## 5. Systems and constants

* **Clock.** A raid always starts at **00:00** (`START_HOUR`, override with `?hour=N`). Day = 10:00-16:00 (6 h, `CLOCK.dayFrom/dayTo`), night = 18 h. Civilians return home from 15:30 until 10:00 (`returnHome = h >= 15.5 || h < 10`). Police patrols (PPS) walk by day; street gangs, night squads and dogs by night. Ambient light 0.65 day / 0.12 night.
* **Factions** (`enemies.js FACTIONS`, relation matrix in `behavior/factions.js`): Administration (3 districts: `novozavodskoy`, `kompressorny`, `nagorny`), Trade Coalition (`rechnoy_port`), 8 gangs, street gangs ("scavs"), civilians, dogs. Gang districts: `holodnaya_gora` Kholodnogorskie; `saltov_bor` Vyshka; `traktornaya_sloboda` Brigada + Kooperativ; `kazanskaya_sloboda` Kazanski + Sobor; `levoberezhe` Sektor + Cherdak. Unclaimed (7): `pavlov_yar, aviastroika, derbyshevka, muromsky_posad, zarechnaya_balka, pokrovskie_dvory, sormovka`.
* **Gang pick** (`modules/start.js`): shown before every raid; 8 gangs + "no gang". Sets spawn district (`dist`), outfit style, free kit (`kit`), `s.playerFac`. Own gang is neutral (4 hits on its members -> whole gang hostile). "No gang": random unclaimed district, kit = pistol + 24 rounds, everyone hostile. Administration and Coalition are hostile only on order violations: weapon raised after a 3 s warning, shot fired in their district, attack on them or on civilians (wanted for 600 s); a shot in the port turns the Coalition hostile. Dogs hate everyone.
* **Population.** Target numbers = spawn table x `hostileK(level)`; night x `NIGHT_MULT` (1.5) from level 1. `nightPressure` keeps at least 16 hostile mobs within 120 m of the player at night (spawn 55-110 m out of sight, they walk toward the player). Cap 760 mobs. **Squads/groups have at most 3 members (`MAX_SQUAD`, v74).**
* **Vision** (`VIS` in `modules/vision.js`, px, 10 px = 1 m): player cone 120 deg x 35 m; weapon raised 90 deg x 40 m; binoculars 28 deg x 80 m; mobs 110 deg x **16 m**; near circle 3-4 m. Light changes mob detection range by at most +-25%. Outside the cone the map is drawn grey and live targets are hidden.
* **Combat.** LMB fires (no hip-fire restriction); aim line to a cross; cursor over a target silhouette shoots at the target centre. Weapons in `config.js WEAPONS` (`pistol` PM 20 dmg/eff 36 m, `shotgun` sawn-off 8 pellets/eff 17 m, `rifle` 65 dmg/eff 72 m; `eff` and `max` in px). Friendly fire on. Doors break under fire. Mobs do not hit mobs in `stepBullets`; gang-vs-gang damage is applied by `behavior/extras.js`.
* **Movement.** Walk ~2.6 m/s, sprint ~6.3 m/s (energy cost -40%). Camera ~28 m; RMB shifts it toward the cursor by +10 m.
* **Vehicles.** Physical cars (drive, shoot, explode, open, loot, fuel item `fuel` not wired yet). `F` enter/exit, W throttle, S brake then reverse, A/D steer relative to the car body.
* **Stats.** 4 stats (str, agi, per, end; base 3, max 10), 3 skills (shoot, scav, med; max 5), ability Adrenaline (`Q`, 5 s, cooldown 30 s). XP per level: `levelBase + level^2 * levelSq` (60 / 25). Needs: hunger 0.22/s, thirst 0.32/s.
* **Death / extraction.** Death loses only what the player carried; stash is permanent; level and stats stay. Exit through an Administration checkpoint (hold `E`) or an opened metro entrance (hold `E` 15 s).
* **City generation rules (v73).** Buildings generated per zone type; max **5 floors** (no 16-storey blocks); keep >= **5.2 m** from asphalt edge (pavement band 4.7 m); no building on road/pavement (audit: 0 of 1837); bins in groups of 2-4 at panel-block ends, one bin at a house gate, containers at warehouse loading sides; only cars on roads; road widths blend smoothly at class changes; lamp placement rule from v72; pavement is drawn before asphalt.
* **Rendering.** Isometric 3/4 on 2D canvas (not WebGL). Buildings opaque from outside; inside only what is in line of sight is shown. Terrain tiles 600 x 600 px, max 12 cached; building spatial grid 640 px.

## 6. Controls

| Key | Action |
| :--- | :--- |
| `WASD` | Move (screen-relative); in a car throttle/brake/steer |
| Mouse / `LMB` | Aim / fire |
| `RMB` (hold) | Look: camera toward cursor +10 m |
| `Shift` | Sprint |
| `R` | Reload |
| `1` `2` `3` / wheel | Weapon slot |
| `4` | Quick heal |
| `Q` | Adrenaline |
| `E` | Door / window; hold: search, open metro entrance, leave the raid |
| `V` | Rifle-butt strike |
| `F` | Enter/exit car |
| `M` | City map (LMB zoom to a block); `Shift+M` mutes sound |
| `Tab` / `I`, `C` | Inventory, character |
| `H` | Controls help |
| `Esc` | Close panel |

Touch: left stick move/sprint, right stick aim/fire, buttons for reload, strike, boost and `E`. PC/browser is the primary platform; mobile comes later. There is **no** crouch, prone or binocular key in v74.

## 7. Known issues and not done

* Municipal buildings (school, clinic, administration, ...) have exteriors and signs but **no interiors**. Interiors elsewhere are procedural, ground floor only.
* Night squad tests fail on the new map: `gangs.test.js` 139 passed / 3 failed (Vyshka night counts within 100 m and 50 m, Sobor within 50 m). Earlier recorded `behavior` results were 55-60 of 60 depending on the map.
* In-browser raid and FPS were never fully validated for v65-v73 (see the notes in `CHANGES_V69..V72`). Road bypass around buildings (v72) is a raster algorithm, not a road-graph optimizer.
* Graffiti texts are original placeholders.
* Not implemented: co-op, cloud save, vertical layers, crafting, weather, door sounds, theft from the player during a search, fuel use.
* Public site runs v73; v74 awaits deploy permission.

## 8. Roadmap

Interiors for municipal buildings and upper floors; 6 stats, weapon-class skills, passives (points only in the safe zone); vertical layers N = -2..+16 (basements, collectors, metro); fixing the night tests on the new map and a browser pass; co-op (P2P, host = player's PC), then cloud saves (Supabase); mobile build.

## 9. World summary (for context)

In 1996 an experiment at the "Block-96" plants tore several cities out of place and fused them; all exits were sealed. By 2003 the city survives on metro tokens (currency and energy), snow, and armed groups. The Administration holds three districts (bridges, substations), the Trade Coalition holds the river port (barges are the only link to the outside), eight gangs hold five districts, seven districts are contested. Outside news arrives only via newspapers dropped from barges. Day is short (10:00-16:00); the 18-hour night belongs to gangs and dogs. Anomalous warehouses spawn loot crates at night.

## 10. Content rules (hard)

* The game is Ukrainian. Do not add real-world geopolitical references or period-political framing anywhere (code, prompts, docs, UI). Allowed aesthetics: panel blocks, the 2000s look, neon accents.
* Nothing after 2003 (no anachronisms).
* On GitHub keep everything in English (or Ukrainian). Documents in other languages live in the project folder, not in the repository.
* Maximum 5 floors for every building.
