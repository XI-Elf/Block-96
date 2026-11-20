# BLOCK-96

A tactical extraction shooter with RPG elements set in a post-Soviet industrial city in 2003, seven years after the technological catastrophe of 1996.

**Status:** early development. Engine: Godot 4 (GDScript). Single-player first, with saves on the player's device; co-op (host = one player's computer) comes later. See [docs/DECISIONS.md](docs/DECISIONS.md).

## Setting
Panel blocks, garages, kiosks, and jury-rigged cyber-tech. The city is split into districts under authority patrols, neutral zones, and contested territories held by player gangs. A river divides the city; the key crossings are bridges with checkpoints.

## Economy
Reprogrammed metro tokens ("energy tokens"): trading, paying upkeep on territory marks, charging implants, and unlocking turnstiles.

## Vertical map
Coordinates are (X, Y, N), where N is the layer number: +1..+16 (high-rises, roofs), 0 (streets, courtyards, industrial zones), -1 (metro, underground tram), -2 (sewers, collectors). See [data/rules/layers.json](data/rules/layers.json).

## Territory
Territory is not bound to district borders: it lives on an invisible 3D cell grid (X, Y, N). Marks can only be placed on pre-placed control points. Sizes: kiosk 2×2, garage 3×3, apartment door 3×3, house gate 5×5, gang mural 15×15+. Adjacent points of one group merge into a polygon. A mark is held by tokens; without tokens the signal fades and the mark can be painted over. Vulnerability windows occur during power outages. See [data/rules/territory.json](data/rules/territory.json).

Strategic points (metro, power plants, bridges, unfinished high-rises) are PvPvE arenas, not residential zones.

## Gameplay loop
Scout and loot → tactical combat (vision cones, sound through floors and tunnels, weapon modding) → co-op or betrayal in temporary squads → fortify or expand.

## Layout
- `docs/` — design and decisions
- `data/world/` — districts, checkpoints, map
- `data/rules/` — layers, territory rules
- `data/levels/` — playable levels (generated)
- `src/` — game code (GDScript); `tests/` — logic tests; `tools/` — generators; `assets/` — resources

## Run
Requires Godot 4.3. Open the project folder in the editor and press F5, or run `godot --path .`.
Logic tests: `godot --headless -s tests/run_tests.gd` (expect `RESULT: OK`).
Controls: WASD move, LMB fire, R reload, F5/F9 save/load.

The setting is original; we do not reuse names, characters, or art from existing games.
