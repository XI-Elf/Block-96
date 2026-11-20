# Decisions

Rule: when material from the earlier Wastland project conflicts with the Block-96 README, Block-96 wins (owner's decision, 2026-11-20).

| Topic | Decision |
|---|---|
| Time / world | Catastrophe in 1996, present day is 2003; the Wastland lore (Lumen, Cascade, AXIS) is not used |
| Currency | Metro tokens ("energy tokens"); "glow tokens" are replaced |
| Territory | Grid marks on control points (X, Y, N), tokens, vulnerability windows; the private 30×50 base plot is not carried over as is |
| Camera | Isometric (the README says "top-down"; the owner's decision wins) |
| Crosshair | A straight line and a cross, no range colour coding |
| Engine / language | Godot 4, GDScript |
| Development order | 1) fully single-player game, client and saves on the player's device; 2) later co-op, host = one player's computer (no dedicated server). Replaces "multiplayer first" |
| First version scope | One district: Pavlov Yar, layer N = 0 only |
| Services | Vercel: web (site, web build). Supabase: later, for accounts / cloud data if needed. No Supabase schema is applied yet |
| Dedicated server | Not needed; Google Cloud e2-micro and the Postgres combat backend are dropped |
| Development order within the district | 1) layout from the map; 2) life and infrastructure (kiosks, stops, poles, power lines, cars, bins); 3) mobs |

## Architecture rules for future host-player co-op
- Simulation is separate from rendering: game state and rules do not depend on render nodes.
- All player input is a command (move, aim, fire, action); the simulation accepts only commands, so a host can later accept the same commands from other players.
- Randomness comes from a seed; state is serializable (this is also the save format in `user://`).
- Entity and player ids exist from the start, even in single-player (player #1).

## Repository rules (owner, 2026-11-20)
- Everything pushed to GitHub is in English (or Ukrainian), no Russian.
- Z layers are called "layers N" (layer N), in code, configs and docs.
- High-rises must be visible at once at the start of a level (a microdistrict of panel blocks next to the spawn).
- Real-world scale: human 1.75 m, floor 2.8 m, car 4.5 m; isometric vertical scale derived from the projection (39.19 px per metre of height).
- Building heights range from single-storey private houses (3.2 m) up to 9-floor panel blocks (25.2 m); nothing taller (owner, 2026-11-20). CIS panel style of the 2000s: 5- and 9-floor slabs and point towers, glazed loggias, antennas.
- Streets and roads must not be only rectangular: bent grids at two orientations, diagonal connectors, buildings oriented along the street (rotated footprints).
- Camera: orthographic, rotated 45 degrees and tilted 55 degrees above the ground (owner's reference photo); constants in `src/world/iso.gd` (ELEVATION_DEG). Default zoom 1.2, mouse wheel 0.6-2.5.
