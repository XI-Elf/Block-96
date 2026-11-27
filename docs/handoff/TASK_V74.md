# First Codex Task: Block-96 v74

> **Status note:** this task was written before v74 started. Its numbering differs from the master plan: the harness fix (v74.1 here) and the PPS selector test (v74.2 here) correspond to plan items v74.3 and v74.4, which are done. Release v75 has shipped; releases continue from v76. See `docs/BLOCK96_DEVELOPMENT_PLAN.md` for the current checklist.

**Do not carry out all versions at once.** Start with v74.1; after that, one subtask at a time, with a checkpoint and approval. Re-check the audit data against the real code. If the working environment has no browser, phone, or required files, say so explicitly.

| Subtask | Priority | Change / check | Acceptance criterion and rollback |
|---|---|---|---|
| v74.1 | P0 | Inventory, the v73 Git baseline, the root of `tests/harness.js` via `path.resolve(__dirname, '..')` or an equivalent; normalize B96_ROOT. Document how to run without hidden paths. | The test entry point runs from a clean checkout; overrides work; the baseline is saved. Rollback — a separate commit |
| v74.2 | P0 | `tests/behavior.test.js`: pick a real `idle === 'patrol'` squad of 3; check setup/FOV and the neutral → warning → stand down/combat sequence on fixed seeds | A confirmed correct fixture; the test is not weakened. Do not change `q.post`/AI without a separate reason. Rollback — a test commit |
| v74.3 | P0/P1 | Save fixtures: `game.js`, `config.js`, v1 parse/normalize, storage error handling, and a safe backup; keep the legacy key `wastland.save.v1` until an agreed migration | The stash is not lost after death or after reading a valid v1; a malformed/unknown version does not destroy the original data; the error is visible. Rollback — the previous version + backup |
| v74.4 | P1 | Separate map checks: 7 bridges, the outer/inner point of doors, a path to an accessible area; a log by ID/district, tolerances by building type | Physical passability is verified, or the specific unverified/impassable places are recorded. Do not treat the door center as a valid freeSpot test |
| v74.5 | P1 | Benchmark: several seeds, warm-up, P50/P95/P99 sim, boot, heap; browser frame time, fog/Canvas, and a mobile trace where possible | A protocol with hardware, browser, conditions, and results. No invented measurements. The instrumentation is reversible |
| v74.6 | P1/P2 | The full available suite, README/CHANGES, instructions for running over HTTP, a list of unresolved defects | A report of commands, statuses, diff, and manual checks; the documentation agrees with the code; no bulk graphics or AI changes |

## Starting prompt (copy into Codex)
Read AGENTS.md and the documents docs/handoff/BLOCK96_CONTEXT.md, docs/handoff/ROADMAP.md, docs/handoff/TASK_V74.md, docs/handoff/AUDIT_V73.md. Work from the current v73. Check Git and do not overwrite other people's changes. Start only with v74.1: reproduce the test harness path problem, record the baseline, make a minimal portable fix, and run the relevant checks. Do not change game mechanics, graphics, AI, the map, saves, or balance in this subtask. In the report, list the files, the exact commands and results, what was not verified, the risks, and the rollback. Do not move on to v74.2 until I confirm.
