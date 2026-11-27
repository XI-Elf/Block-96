# BLOCK-96 - instructions for AI agents and contributors

Read `README.md` first. Its "Project rules (mandatory)" section is the authoritative list; this file is the short version plus the working process. If a task conflicts with a rule, stop and ask the owner. Do not work around a rule.

## Context

Block-96 is an existing browser 2D extraction game (plain JavaScript, canvas, no build). The task is to develop it, not to create a new game. Current release: v79. Roadmap: `docs/BLOCK96_DEVELOPMENT_PLAN.md`. Background: `docs/handoff/BLOCK96_CONTEXT.md`, `docs/handoff/ROADMAP.md`, `docs/handoff/VISUAL_STYLE.md`. Check technical claims of older documents (`docs/handoff/AUDIT_V73.md`) against the current code.

## Hard rules

1. All repository text (code, comments, docs, commits, PRs, issues) is English or Ukrainian.
2. The setting is Ukrainian, year 2003. Never refer to Russia or Russian culture and never use the labels "Soviet" or "post-Soviet" in any language, in any file or message. Use "panel blocks" and "early-2000s aesthetics". No anachronisms after 2003.
3. The shelter stash survives death and evacuation. Do not change this.
4. A raid group (squad, street gang, night patrol) has at most 3 members.
5. Buildings have at most 5 floors, keep 5.2 m from the asphalt edge and never stand on roads or pavement.
6. The owner's drawn map is the basis of the city (2918 x 1946 m, 16 districts). Do not change districts, roads, scale or city size. Do not hand-edit generated data (`world15.js`, `road_network.*`). Mirror in-game map changes back to the owner's editor data and never overwrite drawn features.
7. Do not change balance, factions, economy, population, camera, projection, controls, the concept, the engine, existing assets or the save format (compatible migrations only) without an explicit task.
8. Do not cut population, territory, features or visibility to gain speed. Optimise only with before and after measurements on the same seed, scenario and device (P50/P95/P99). Node timings are not phone FPS.
9. The simulation is deterministic: no `Math.random`, no DOM, state only in the world object. Never write data into the DOM as a plain string: use `WL_DOM`. No external network requests from the page, no new third-party assets without a licence entry.
10. Gang relations stay primitive: members of one gang do not attack each other, district owners defend against raiders. No territory capture or influence system. Do not extend the gang-versus-gang fights in `behavior/extras.js`.
11. Do not change the localStorage key `wastland.save.v1`.

## Process

1. Check the working tree and Git state. Branch from the latest `main`. Never push to `main`; open a pull request. The owner also commits through Codex: never overwrite those commits.
2. Define the boundary of one task, reproduce the problem, record the starting result and the run conditions.
3. Make the smallest verifiable change. Do not widen the task and do not weaken tests to get green.
4. Run the targeted tests, then the available regressions (see `README.md`, "Tests"). Report PASS, FAIL, SKIP, TIMEOUT and what was not run. Re-run only what failed while fixing.
5. For performance, compare the same seed, scenario and device. Record P50/P95/P99, boot time and memory.
6. Document changed files, results, risks, limits and how to revert. Add a `CHANGES_Vnn.md` entry for a release. Do not claim success without a measurement and do not describe planned features as implemented.
7. Stop at a checkpoint. Do not start the next stage, publish a release, deploy to Vercel or push without the owner's permission.

## Current priority

Releases v74-v79 are done (see `CHANGES_V74.md` to `CHANGES_V79.md`). Open items, in the order of the plan: stairs and upper floors (v77.3), level of detail for far mobs (v79.2-v79.5), Visual V2 graphics (owned by another contributor), real-device performance measurement. The roadmap is a plan, not a permission to do everything at once.
