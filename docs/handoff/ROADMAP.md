# Block-96 Roadmap: v74–v80

> **Status after release v75:** v75 is shipped and releases continue from v76. The harness fix and the PPS test selector (plan items v74.3 and v74.4) are done; v75.1 is partly done. See `docs/BLOCK96_DEVELOPMENT_PLAN.md` for the item-level checklist.

A proposed order, not a calendar. The version number may change at the owner's decision. The first version fixes confirmed defects and creates a basis for verification. Later versions are allowed only after the checkpoint of the previous one. P0 — blocks safe development/saving; P1 — important stability; P2 — improvement; P3 — experiment.

| Version | Priority | Scope | Acceptance / control |
|---|---|---|---|
| v74 | P0/P1 | Baseline, portable harness, PPS test, saves, map checks, diagnostic profile, up-to-date documentation | Reproducible results, stash preserved, a PASS/FAIL/SKIP report, a device baseline or an honest blocker |
| v75 | P1 | Profiling and low-risk geometry/memory optimization, Canvas fog and DPR where a benefit is proven | Comparison on identical scenarios; collisions and visibility unchanged; no regressions |
| v76 | P1/P2 | Visual prototype of one quarter | The owner approves the look; mobile day/night test; the camera does not change |
| v77 | P1 | Fix discovered entrance/bridge problems; local and global navigation if needed | 7 bridges in both directions for the intended movement types; accessible entrances or explicit exceptions |
| v78 | P2 | Scale the approved materials, light, interiors, vegetation, and effects | Stability across several districts; memory, FPS, tests; assets have confirmed rights |
| v79 | P2/P3 | Multi-rate AI/LOD only if the profile shows a need | Continuity of NPC, faction, combat, search, and route state; a proven gain |
| v80 | P2/P3 | Chunked streaming and lazy interiors if a need is confirmed | World determinism, loot preserved, no collisions/disappearances at borders, lower boot/heap |

## Optimization order
1. Measure the baseline: simulation, rendering, frame durations, boot, heap/GC, NPC density; several seeds, cold/warm start. Real Android/iOS where available.
2. Geometry: first measure and merge only compatible static segments; then compact storage and chunk indexing. Keep the original collision corpus and compare the outputs of wallsNear/rayWall/freeSpot. Do not merge across doors/windows; account for materials, flags, floors, and IDs.
3. Graphics: half-resolution visual fog as an A/B test (25% of the buffer area, not a guaranteed frame speed-up); keep exact visibility. Limit DPR, cache static layers; caches with a budget and invalidation. OffscreenCanvas/Worker only after measurement and a compatibility check.
4. Navigation: check agent dimensions, obstacles, bridge connections, and entrance accessibility. Limit the planner per frame if needed; track path progress, do not teleport NPCs to mask errors.
5. AI: separate perception, last-contact memory, decisions, routing, and coordination. Do not change the working state machine at first. Raise LOD during combat, visibility, and relevant events; avoid oscillation between levels. Measure the result.
6. Saves: parse/normalize/migrate, backups, and explicit write errors. First the current format and reversibility. IndexedDB/transactions for growing data is a separate task, not a requirement for immediate migration.

## Release criteria
- Syntax and the mandatory automated checks passed; checks that were not run or timed out do not count as PASS.
- Raid, death, evacuation, stash, and loading of an old save are verified. Items do not vanish or duplicate.
- Bridges, entrances, vehicles, night visibility, and combat scenarios are verified according to the release scope.
- Real measurements on the target device: P95 frame time up to 16.7 ms for the chosen 60 FPS mode or up to 33.3 ms for 30 FPS. These are targets, not stated results. Log P99/long frames and heating.
- The city and population have not been reduced without permission; the camera and style have not been changed without agreement.
- There is a changelog, a report, a rollback point, a list of limitations, and manual checks. The owner approves the release.
