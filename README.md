# Block-96

A single-player, top-down isometric extraction game that runs in a browser (plain JavaScript, canvas, no build step).
You raid a large Ukrainian city in 2003, seven years after a catastrophe sealed it off: panel-block districts, gangs, a dark and snowy night, scavenging, cars, and a shelter with a permanent stash.

This README describes the build as of **release v79**. Everything here is checked against the code unless it is marked *planned* or *unverified*.
Rules that every contributor, human or AI, must follow are in [Project rules](#project-rules-mandatory) and in [AGENTS.md](AGENTS.md).

## Run it

Open `index.html` in a browser. There is no build step and no dependency. For local development with the test and profiling scripts, serve the folder, for example `python3 -m http.server 8765` in the repository root.
Node.js 22 is used for the headless tests. Platform priority: desktop browser first, phone later.

## The game in one page

- **Setting.** Ukrainian city, 2003, after a catastrophe in 1996. Panel blocks and the real look of the early 2000s, neon only as rare accents. External exits are sealed; checkpoints inside the city belong to the Administration. The map is about 2918 x 1946 m with 16 districts, 7 bridges, about 1837 buildings and about 7.7k containers.
- **Loop.** Shelter (a separate small location with a stash, a shop and a character terminal) -> pick a gang -> raid -> loot -> leave through an evacuation point, or die.
- **Raid start.** Every raid starts at 00:00, at night, with all gangs on the street.
- **Death.** You lose only what you carried into the raid. The shelter stash is permanent. Level and stats stay.
- **Gangs.** Before each raid you choose one of 8 gangs or "no gang". The choice sets your spawn district, outfit, starter kit and who is hostile (see [Hostility](#hostility)).
- **Day and night.** Day is 10:00-16:00, the rest is night (with dusk and dawn blending). By day civilians walk the streets; in the evening and at night they go home, and mobs have homes too. Dogs have no home and are only out at night. Night is much denser than day and is meant to be dangerous from level 1.
- **Combat.** Firearms first (pistol, shotgun, rifle), melee with the butt (V). Friendly fire is on. Doors and windows break under fire and make noise. Light comes from street lamps; the player sees in a 120-degree cone, mobs see 16 m.
- **Vehicles.** Physical cars built from primitives: drive, shoot, explode, break in, loot, fuel. Controls are relative to the car's nose.
- **Buildings.** Houses and blocks have procedural interiors (first floor only in this build), doors, locks, loot. Locked doors and garage gates can be forced by holding E (noisy).
- **Progression.** Stats (strength, agility, perception, endurance) and skills (shooting, scavenging, medicine); points are spent only in the safe zone. Weapon skill grows from use.

### Controls

W A S D move (screen-relative on foot) | LMB fire | RMB hold to look further | R reload | 1 2 3 weapons | E search, interact, hold to force a locked door or gate | V butt strike | Shift sprint | Q adrenaline | Tab inventory | C character | M city map | H help | Esc close panels. Touch controls exist as two sticks.
Car: W throttle, S brake then reverse, A/D steer relative to the car's nose, F enter/leave.

### Hostility

- Your own gang does not attack you. Four hits on your own people turn the whole gang against you.
- "No gang": everyone is hostile.
- Administration police and Trade Coalition guards stay neutral until order is broken (weapon raised, shooting in their district, attacking them or civilians). Then they act, and a wanted state lasts 600 game seconds.
- Dogs are hostile to everyone. Civilians are neutral.
- **Gang relations are deliberately primitive (owner decision, 27 Nov 2026):** members of one gang do not attack each other, and the owners of a district defend it against raiders of other gangs. There is no territory capture and no influence system, and none is being developed now. `behavior/extras.js` still contains gang-versus-gang fights from earlier work; do not extend them.

## Repository map

| Path | What it is |
|---|---|
| `index.html` | Page, screens, help text. Loads the scripts in a fixed order (below). |
| `config.js` | Game data: weapons, items, loot tables, stats, save key, world scale. |
| `world15.js`, `road_network.js/.json` | Generated city data (roads, water, parks, districts, buildings footprints, bridges). Generated from the owner's map; do not hand-edit. |
| `sim.js` | Deterministic simulation: world generation, physics, bullets, doors, cars, containers. No DOM. |
| `nav.js` | Navigation grid and A* for mobs. |
| `enemies.js`, `behavior/factions.js`, `behavior/extras.js` | Mob and NPC behaviour (scripted state machines, not neural networks), faction matrix, spawn tables, night pressure, extras (tripwires, shields, smoke, door locks, gang fights). |
| `player.js`, `hud.js`, `feel.js`, `threat.js` | Player step, HUD, game feel, threat indicators. |
| `game.js` | Client: input, rendering, camera, audio, screens, save wiring, URL parameters. |
| `modules/save.js` | Versioned save format, migrations, backups (`WL_SAVE`). |
| `modules/dom.js` | Escaping HTML templates (`WL_DOM`). The only allowed way to put data into the DOM. |
| `modules/interiors_sim.js`, `modules/interiors.js` | Building interiors, doors, locks, forced entry (simulation and drawing). |
| `modules/vehicles-phys.js`, `vehicles-draw.js`, `vehicle-view.js` | Cars. |
| `modules/bridges.js`, `bridges-data.js` | Bridge geometry and drawing. |
| `modules/characters.js`, `graffiti.js`, `vision.js`, `start.js`, `map.js`, `shop.js` | Procedural character rig, wall writing, field of view, gang/start screen, full-screen city map, shop. |
| `assets/` | Textures (`*.png`, tiles and facades) and local fonts (`fonts/`, with licence texts). |
| `tests/` | Headless tests and profiling scripts (see [Tests](#tests)). |
| `docs/` | `BLOCK96_DEVELOPMENT_PLAN.md` (roadmap v74-v80 and Visual V2), `handoff/` (context, audit, profiling, visual style). |
| `CHANGES_V*.md` | What changed in each release. Newest first in practice: v79. |

Script order (as in `index.html`): `config`, `dom`, `vehicles-phys`, `vehicles-draw`, `world15`, `road_network`, `bridges-data`, `bridges`, `nav`, `interiors_sim`, `sim`, `behavior/factions`, `enemies`, `player`, `hud`, `feel`, `threat`, `vision`, `behavior/extras`, `vehicle-view`, `characters`, `graffiti`, `interiors`, `start`, `map`, `shop`, `save`, `game`.
`modules/vision.js`, `behavior/extras.js` and the other optional modules attach to `window` objects (`WL_*`); `sim.step` uses a module's function when it exists and the built-in one otherwise.

### Architecture rules

- The simulation (`sim.js`, `enemies.js`, `player.js`, `behavior/*`) is deterministic: seeded random only, no `Math.random`, no DOM, all state in the world object `s`. Commands go in, events come out.
- Rendering is a 2D isometric 3/4 projection on canvas (not three.js). The camera shows about 28 m. Do not change the projection, camera or coordinates without an explicit task.
- Scale anchor: the character is 1.8 m and everything uses real proportions. 10 world px = 1 m.
- Shared files (`config.js`, `sim.js`, `game.js`) are edited by one person or thread at a time. New data goes in new keys; existing keys are not renamed.
- Unit of work is one small, verifiable change with tests. Do not weaken a test to make it pass.

## Saves

`modules/save.js` owns the format. The localStorage key stays `wastland.save.v1` (a historical name; changing it would wipe players' saves).
- Current format is `v: 2`. Migrations are step by step (`MIGRATIONS[n]` turns vN into vN+1). A v1 save loads, is normalised and is written as v2 on the next save.
- Unknown item and weapon ids are dropped; the untouched original is kept under `<key>.premigrate`.
- Every write first copies the previous valid save to `<key>.bak`, then reads the value back to verify it.
- An unreadable save is copied to `<key>.corrupt` and the `.bak` is tried. A save written by a newer build switches writing off.
- Storage failures show an in-game message instead of being swallowed.
- The stash survives death and evacuation (`WL_SAVE.applyRaid`, covered by `tests/save-dom.test.js`).

## Safe DOM and privacy

- Data never reaches `innerHTML` as a plain string. Use `WL_DOM`: `html` tagged templates escape every value, `setHtml(el, fragment)` is the only writer, `h(tag, attrs, ...kids)` builds elements. `tests/save-dom.test.js` fails on any other `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` and on any `http(s)` URL in `index.html`.
- Fonts are self-hosted (`assets/fonts/`, SIL OFL 1.1). The page makes no third-party requests, so no visitor IP leaves the origin. Do not add external fonts, CDNs, analytics or trackers.

## URL parameters (for control scenes and tests)

`?seed=N` fixes the world seed (and the snow flurries), `?at=x,y` places the player at that point (metres) at raid start (choose a free spot), `?hour=H` sets the start hour. Without parameters nothing changes.

## Tests

Run from the repository root with Node.js. `B96_ROOT=<path>` loads a different checkout.

| Command | Checks | Last result (v79) |
|---|---|---|
| `node tests/behavior.test.js` | Behaviour rules, schedules, factions | 63/63 |
| `node tests/extras.test.js` | Extras, dense-night tick budget | 22/22 |
| `node tests/gangs.test.js` | Gang start, hostility, night density | 141/142 |
| `node tests/save-dom.test.js` | Save layer, DOM safety, no external URLs | 37/37 |
| `node tests/perception.test.js` | Hearing, vision, sleeping mobs | 11/11 |
| `node tests/pry.test.js` | Forced entry of doors and gates | 13/13 |
| `node tests/districts-nav.test.js` | Routes between the 16 districts | 10/10 |
| `node tests/passability.test.js` (about 1.5 min) | 7 bridges, doors, routes; exception list in `tests/passability-exceptions.json` | 47/47 |
| `node tests/stall.test.js` (about 1.5 min) | Agents that stop making progress | informational |

Known failing check: gangs "vyshka: night, hostile armed within 100 m >= 12 (got 10)". It is a consequence of the 3-member group limit; the expectation has not been changed on purpose. Do not "fix" it by raising group sizes.
Profiling: `node --expose-gc tests/profile-boot.js`, and `node tests/profile-browser.js` with a local server (`B96_CHROMIUM` selects a browser binary).

## Measured baseline (software rendering, not a phone)

Cloud container, 4 vCPU, Node 22, headless Chromium with software canvas. These numbers do **not** describe a phone or a GPU.
World generation 1.7-2.5 s; first tick 0.43-0.48 s; dense night simulation about 3.3 ms per tick (budget 6 ms); browser boot to first frame 1.2 s; frame interval P50 33 ms, P95 50 ms (software canvas); JS heap about 142 MiB; 0 console errors. Release targets (30 FPS on a weak device, 60 on a fast one) are goals. **Real-device FPS has not been measured.**

## Navigation and entrances (v77)

All 7 bridges are passable on foot and by sedan and truck in both directions (`sim.js` `bridgeCarve` clears the water mask under every deck). Entrance doors are 1.2 m wide (`ENTRY_W`). 41 entrances that still fail are listed with a category in `tests/passability-exceptions.json` (mostly houses in the roadless area east of the river); the test fails on any new failure and on any listed exception that starts passing. Details: `CHANGES_V77.md`, `CHANGES_V78.md`.

## Garages and forced entry (v79)

Every garage box has its own roll gate (1025 gates, about 27% locked). Locked exterior doors and gates can be forced: hold E next to them, 3 s for a door and 6 s for a gate (`WL_HOUSES_SIM.pryTick`). It makes noise every second (heard like a kicked-in door, 45 m) and is cancelled by releasing E or walking away. Shooting the lock still works.

## Not done yet (do not assume these exist)

- Upper floors, stairs and layers above and below ground inside buildings: only the first floor is playable (plan v77.3).
- Visual V2 (new materials, lighting, facades). Another contributor is doing it; a rejected draft is not merged. The control scenes and the licence register are in PR #10.
- Co-op (planned later, host is the player's PC) and phone support (planned after desktop).
- Territory capture and gang-to-gang diplomacy (not planned now, see Hostility).
- Level-of-detail for far mobs beyond the existing sleep radius (plan v79.2-v79.5).
- UI text is not localised to Ukrainian yet; whether and when to do it is an owner decision.
- Real-device performance and thermal checks.

## Project rules (mandatory)

These come from the owner. If a task seems to conflict with one, stop and ask instead of working around it. When two sources disagree, the owner's explicit rule wins over older text and PDFs.

1. **Language of the repository.** Everything in GitHub (code comments, docs, commit messages, PRs, issues) is in English or Ukrainian only.
2. **The setting is Ukrainian.** Never use any reference to Russia or Russian culture, and never use the labels "Soviet" or "post-Soviet" (in any language), anywhere: code, text, prompts, docs, commit messages. Describe the look with "panel blocks" and "early-2000s aesthetics". The year is 2003, so no anachronisms after 2003.
3. **Stash is permanent.** The shelter stash is kept after death and after evacuation. Only what the player carried into the raid can be lost.
4. **Group size.** A raid group (squad, street gang, night patrol) has at most 3 members.
5. **Buildings.** No building is taller than 5 floors; there are no 16-storey blocks. Buildings keep 5.2 m from the asphalt edge and never stand on a road or pavement.
6. **Map.** The owner's drawn map (export of the map editor, 2918 x 1946 m, 16 districts) is the basis of the city. Do not redraw districts, roads, scale or city size. Generated data files are not edited by hand. Map changes made in the game must be mirrored back to the owner's editor data, and drawn features are never overwritten.
7. **Do not change without an explicit task:** balance, factions, economy, population counts, camera and projection, controls, the game concept, the engine, existing assets, the save format (only compatible migrations).
8. **Do not trade quality for speed.** Do not cut population, territory, features or visibility to make the game faster. Optimise only with before and after measurements on the same seed, scenario and device (P50/P95/P99), and report measured results, not guesses. Node timings are not phone FPS.
9. **Determinism and safety.** No `Math.random` or DOM in the simulation; no raw `innerHTML`; no external network requests from the page; no new third-party assets without a licence entry (see PR #10 register).
10. **Gang relations stay primitive** (see Hostility). No territory capture or influence system.
11. **Process.** Branch from the latest `main`; never push to `main`; open a pull request. Do not overwrite the owner's own commits (the owner also works through Codex). Do not publish a release, deploy to Vercel or push without the owner's permission. Run the relevant tests, report PASS, FAIL, SKIP and what was not run, and never claim success without a measurement. Stop at a checkpoint and wait for the owner's go-ahead before the next stage.
12. **Honesty.** Mark unverified statements as unverified. Do not describe planned features as implemented.

## Documents

- `docs/BLOCK96_DEVELOPMENT_PLAN.md` - roadmap v74-v80 and Visual V2.
- `docs/handoff/` - project context (`BLOCK96_CONTEXT.md`), audit of v73, optimisation and profiling notes, visual style, sources.
- `CHANGES_V69.md` ... `CHANGES_V79.md`, `LIGHTING_*`, `MATERIALS_V68.md`, `TERRAIN_V62_NOTES.md`, `OPTIMIZATION_V65.md` - history and design notes per release.
- `TEXTURES.md` - texture guide for other generation tools (no text inside textures; match the mean colours listed there).
- `tests/README.md` - how to run the tests.

## Licence

All rights reserved by the owner. No open-source licence is granted. Textures and the props sheet were generated by the owner with an image generator; the terms are recorded as owner-stated in the asset register (PR #10).
