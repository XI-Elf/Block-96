# v77
Stage v77 (navigation and physics) of `docs/BLOCK96_DEVELOPMENT_PLAN.md`.
- Bridges: water under every deck is carved in `genWorld` (`bridgeCarve`), M5 and M7 now passable; 7/7 on foot and by sedan and truck, both directions.
- Entrance doors 1.0 -> 1.2 m (`ENTRY_W`); tight doors 634 -> 0.
- Door face choice avoids a neighbour's wall in front (`frontClear`).
- `tests/passability.test.js` added (from the QA thread) with scaled time limits, nearest free car approach and a documented exception list `tests/passability-exceptions.json` (41 doors).
- Tests: passability 47/47; behavior 63/63; extras 22/22; save-dom 37/37; gangs 141/142 (Vyshka night count is now 10, was 11; same known failure from the 3-member group limit, expectation unchanged).
- World generation time unchanged within noise (2.1-2.4 s, node).
- Not done / open: stairs, floors and agent-size checks (v77.3), inter-district routing and no-progress detection (v77.4), 245 garage rows without an entry door, the 41 documented doors. Not changed: balance, camera, city size, population, AI.
