# BLOCK-96 — Development Context for Codex

> **Status after release v75:** this digest dates from 26.11.2026 and describes the v73 control build. Release v75 has since shipped (harness and PPS test fixes done; v75.1 partly done) and releases continue from v76. See `docs/BLOCK96_DEVELOPMENT_PLAN.md`.

State of the discussion: 26.11.2026. This file is a portable digest of the chat, not a verbatim export of the conversation. All audit facts refer to the v73 control build; re-verify them on the current checkout. Research and architecture proposals are not features that already exist.

## 1. Goal and owner decisions
Block-96 is a 2D browser game with raids, a shelter, loot, a city, vehicles, buildings with interiors, a population, and factions. Mobile play is the priority. The owner provided two video references and explained: the graphics and camera orientation there differ, but the result shown is what they want to see. The direction adopted in the discussion: carry the atmosphere and visual detail over to the existing camera, without changing the engine without agreement. The owner confirmed: "the stash is not lost". Keeping the stash is a mandatory rule, not a defect.

## 2. Discussion timeline (digest)
1. The user: "audit ." — a request to check v73. The first audit revealed a non-portable test harness, failing PPS checks, outdated descriptions, and performance risks. A full browser run was not performed. The initial conclusion that the PPS was broken was too strong.
2. The user: "the stash is not lost. check everything else, propose solution and optimization options". The clarification was recorded. The in-depth audit (in the attached DOCX) showed a false selection of a post guard instead of a patrol, road-network connectivity through the bridges, and 0 building–road conflicts in the runtime audit. The main risks are boot, geometry memory, tests, save migrations, and unverified mobile graphics/entrance accessibility.
3. The user asked to research new games of the genre and AAA titles, the overlap of errors, and technically correct solutions. ZERO Sievert, Escape from Duckov, Project Zomboid, Cataclysm: DDA, S.T.A.L.K.E.R., Assassin's Creed Unity, Cyberpunk 2077, Horizon Zero Dawn, and Suroi were compared. Conclusion: adapt proven principles rather than copy someone else's engine. See section 5.
4. The user attached two videos: "The graphics here are different. And the camera orientation. But this is what I want to see." A reference quarter, wear textures, interiors, light, shadows, vegetation, weather, combat effects, and animations were proposed. The exact engine of the references has not been established. The art style and implementation require the owner's approval.
5. The user asked for a phased update plan via Deep Research. The research was launched; a finished standalone result is not present in the available conversation. The roadmap in this package is a synthesis of the available audit and discussion, and is not passed off as a completed Deep Research report.
6. ChatGPT modes were discussed. Recommendation: ChatGPT for architecture/planning and Deep Research for sources; Codex + Git for edits and tests; a real device for checking graphics. AGENTS.md and the v74–v80 plan were proposed.
7. The user asked to start work through Codex Tasks. The commands for launching the remote environment turned out to be unavailable. Codex work was not started, and the sources were not changed. The v74 task was prepared.
8. The user asked to collect the chat into an archive or a linked context for Codex. This package, the instructions, and the source materials were prepared.

## 3. State verified by the attached audit
| Indicator | Value / status |
|---|---|
| City | ≈2918 × 1946 m, 16 districts, 7 bridges |
| Buildings / containers | ≈1837 / 7770 |
| Static wall segments | ≈503,000 |
| JS | 31 files, node --check passed per the audit |
| NPCs by day, level 1 | ≈267–268; average step 1.05–1.86 ms |
| NPCs by day, level 8 | ≈435–436; 1.75–2.49 ms |
| NPCs by night, level 8 | 621; ≈3.10 ms per step |
| Boot + short warm-up | ≈3.4–5.0 s (headless) |
| Road network | 4 raster components before bridges; connected once bridges are counted |
| Building–road conflicts | 0 per the runtime audit; the exact 5.2 m setback is not proven |
| Interiors / exterior entry doors | ≈1782 buildings / 1534 door objects; physical accessibility not proven |
| Mobile FPS / GPU | Not measured in the audit |

### Confirmed problems / risks
- `tests/behavior.test.js:58–62`: selecting the PPS by `!q.post` does not guarantee a patrol. The diagnostic selected a single `pps_rpk` with `q.post === false`; a real 3-member patrol, correctly selected, transitioned to WARN_HOLSTER. Do not rewrite the AI on the strength of four false/dependent failures; check the full scenario and seeds.
- `tests/harness.js`: a historical absolute root; no standard npm test; many expensive boots. A full pass of gangs/extras is not confirmed. Separate unit, fixtures, integration, and smoke.
- `game.js` loadSave/persist: only v1 is loaded, weak normalization, storage errors are suppressed. Risk of silent progress loss with future changes. The stash after death works according to the rule.
- Geometry: a spatial grid already exists. The number of objects raises the cost of boot and memory; evaluate the heap profile and the merging of compatible static segments/compact storage, and do not change collisions blindly.
- `modules/vision.js`: a full-size Canvas mask and composition in several passes; a presumed, not proven, mobile hotspot. Check it on a phone.
- `README.md` and the PDFs lag behind v73. Old file names, city sizes, and 15 districts/stash loss in the PDFs are historical data, not a specification.
- DOM `innerHTML`: a potential risk with import/mods/network data; no XSS is proven. Use safe DOM APIs for untrusted text, and do not introduce a CSP that breaks loading without tests.

## 4. Architectural guidelines
Keep Canvas 2D and the existing modules until another technology is proven necessary. Measurements first, then a minimal fix. Potential components: GeometryStore (a compatible wallsNear/rayWall API), ChunkManager (deterministic IDs and seed), Navigation (a global graph + local routes, different agent/vehicle profiles), AI Scheduler (separate rates if needed), SaveManager (parse/normalize/migrate/backup). Do not assume these names are existing files.

NPC simulation must preserve health, goals, affiliation, inventory, and state when the LOD changes. The distant world must not stop existing. The visual mask must not replace the exact gameplay visibility checks. With lazy interiors, the identity of the layout and the state of a searched container are preserved. Check bridges and entrances by physically walking them, not just through the graph. 64 m chunks, 50/150/400 m levels, and 60/15/2 Hz rates were discussed as experimental examples, not requirements.

## 5. Technical research references (summary of the earlier discussion)
| Project | Principle to study | Transfer level |
|---|---|---|
| ZERO Sievert | Perception, last known position, searching after contact is lost | Study the behavior and patches; the code is closed |
| Escape from Duckov | Backups, item recovery, visibility | Study the patches; do not copy the save format |
| Project Zomboid | Chunk caching, static layers, VRAM risks and artifacts | An experiment on a single quarter |
| Cataclysm: DDA | Reality Bubble, streaming and saving of regions | Open source, differences from a turn-based engine |
| S.T.A.L.K.E.R. / S.T.A.L.K.E.R. 2 | A-Life, global/local simulation, online/offline transitions | Do not switch off distant NPCs; control continuity |
| Assassin's Creed Unity / Unreal Mass | AI LOD, load scheduling | Only after profiling |
| Cyberpunk 2077 | Separating NPC, squad, and faction reactions | Explicit semantics; do not rewrite working logic |
| Horizon Zero Dawn / Recast | Hierarchical planning and connections | Adapt to 2D; a full 3D navmesh is not required |
| Suroi / PixiJS | Browser batch rendering | Only a comparative prototype if needed |

The references to games in this file are a retelling of the discussion, not new confirmation of specific patch dates or closed implementations. Links for independent study: `SOURCES.md`. Do not carry over someone else's code or assets without checking the license.

## 6. Working order
First `AGENTS.md`, then `TASK_V74.md`, `ROADMAP.md`, `AUDIT_V73.md`, and `VISUAL_STYLE.md`. Work by subtasks, document the results, and ask permission to change invariants. Do not publish a release automatically. None of the proposed optimizations is yet accepted as a mandatory change without verification.
