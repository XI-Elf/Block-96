# Text of the Original v73 Technical Audit

> **Historical document.** This is the audit of the v73 control build; release v75 has since shipped. Findings on the harness path and the PPS selector have been addressed (plan items v74.3 and v74.4). Re-verify everything else against the current code.

Automatic extraction from the attached DOCX: paragraphs and tables in the original order. Formatting and live hyperlinks may differ; the original is kept in the full package. These are the results of the earlier audit, not of a new run.

## In-Depth Technical Audit of Block‑96 v73

## Methodology and verification status

The audit was performed anew on the actual build block96-js-v73.zip and the unpacked sources in /mnt/data/block96_audit/, without taking the conclusions of the previous audit as true. README.md, CHANGES_V72.md, CHANGES_V73.md, Block96-presentation-mobile.pdf, and Block96-README-collage.pdf were also compared. The user's rule about death was accepted as the specification: the shelter stash is kept after death, and this is correct behavior. It matches the current README.md, the stash interface, and the save implementation (README.md:23–27, index.html:197–202, `game.js:13–21).

All JavaScript files in the archive were checked with node --check; no syntax errors were found in the checked build. The archive contains 31 JS files but no package.json, so there is currently no common npm test-level standard runner. Headless tests are run through the project's own tests/harness.js, which loads the modules into a vm and simulates a fixed 1/60 s step (tests/harness.js:8–24).

Status of the main areas after re-verification:

| Area | Status | Confidence level |
| --- | --- | --- |
| Stash loss after death | Not a defect | confirmed by code and specification |
| Failing PPS tests | A test defect / ambiguous squad classification, not a proven AI defect | confirmed by reproduction and code |
| A population of hundreds of NPCs | Works headless; mobile performance not proven | only the CPU simulation was measured |
| Road network gaps | No explicit topological gap found once bridges are counted | automatic static check |
| Buildings on roads | 0 conflicts in the runtime audit | confirmed by code/runtime |
| Accessibility of all entrances | Not proven | a path/accessibility test is required |
| Saves | Work for the current v1, but there are no migrations and no full normalization | confirmed by code |
| DOM security | No exploitable vulnerability proven; there are potentially dangerous innerHTML sinks | confirmed by code |
| Mobile Canvas | There are reasonable optimizations, but fog/compositing remains potentially expensive | code confirmed, FPS not measured |
| Documentation | Substantially outdated relative to v73 | confirmed |
| Test tooling | Non-portable B96_ROOT, expensive full-world boots | confirmed |

The limitation of the audit is fundamentally important: a full Chrome/Safari/Android/iOS run with GPU profiling was not performed in this environment. Therefore nowhere below is a headless Node benchmark presented as mobile FPS.

## PPS AI and the failing tests

The earlier conclusion "the PPS behavior is broken" turned out to be too strong. The four observed failures do reproduce in the PPS: WARN_HOLSTER block, but the test itself selects the PPS fighter insufficiently precisely.

The critical line is in tests/behavior.test.js:58:

d.fac === 'admin' &&
q &&
q.zone === 'novozavodskoy' &&
!q.post

After the selection, the test immediately requires the found squad to consist of three fighters (tests/behavior.test.js:60). However, the spawn tables of the administration faction contain both patrol triples and single post variants pps_svd/pps_rpk. For these types the semantic mode is set through idle:'post', but that does not mean the corresponding squad object necessarily has q.post=true. As a result, the predicate !q.post can select a single post guard pps_rpk instead of a patrol.

In the diagnostic runtime run this is exactly what happened: the selector chose pps_rpk, members.length === 1, and q.post === false. Thus the first failure, "PPS patrol squad has 3 members", is a confirmed false positive of the test.

The following three failures follow logically from the same selection error. The test first leaves the selected NPC for 1.5 seconds in the neutral state (behavior.test.js:61), then raises the player's weapon and expects an immediate transition to WARN_HOLSTER (:62). A post NPC is entitled to change orientation/idle behavior during that time. The transition to a warning depends not only on the fact that the weapon was raised but also on the current detection of the player. If a non-patrol actor was selected and the player has already left the FOV, the test checks a state that its setup no longer actually guarantees.

When the diagnostic selection was changed to a real patrol — a type with d.idle === 'patrol', a squad of three members, and the matching zone — the transition to the warning did happen: after the weapon was raised the state became warn, and the AI marker became WARN_HOLSTER. This means the combat AI must not be rewritten on the basis of the four existing failures.

The safest fix is not to use q.post as an indirect indicator of squad type. It is better to introduce explicit semantics:

sq.role = 'patrol'; // or 'post', 'guard', ...

and to select q.role === 'patrol' in the tests. An alternative minimal option is to change only the test predicate to d.idle === 'patrol' && q.members.length === 3. Automatically setting sq.post = d.idle === 'post' is less desirable: sq.post already takes part in runtime behavior, so such a change could quietly alter the radius and movement rules of post NPCs, not just fix the test.

The acceptance criterion here must be much stronger than one green run: a real three-person PPS patrol must correctly pass the sequence "weapon lowered → neutral; weapon raised → warning; lowered before the deadline → stand down; not lowered → combat" on a series of deterministic seeds. It is desirable to check not only the final state strings but also that line-of-sight/setup holds immediately before each phase.

A separate documentation discrepancy was found: CHANGES_V73.md:10 claims behavior 55–60/60, whereas in the actual archive the existing PPS test contains the described ambiguity and can fail. Therefore the number from the changelog cannot be used as proof of the current state of this particular copy of v73.

## Simulation performance and memory

In the headless profile, simulating hundreds of NPCs does not by itself look like the main frame bottleneck, but world start-up and the volume of static geometry deserve attention.

The following values were obtained in the checked build. This is not a browser and not a mobile device but a Node/headless harness, so the results mainly characterize the cost of the simulation logic.

| Scenario | NPCs | Average step | Observation |
| --- | --- | --- | --- |
| Day, level 1 | ~267–268 | ~1.05–1.86 ms | a noticeable margin against 60 Hz |
| Day, level 8 | ~435–436 | ~1.75–2.49 ms | the cost grows moderately |
| Night, level 8 | 621 | ~3.10 ms | 600+ NPCs still below the existing headless budget of 6 ms |
| World initialization + short warm-up | — | roughly 3.4–5.0 s | substantially more expensive than one runtime tick |

In the dense-night run, 600 simulation ticks took roughly 1.86 s of wall time, i.e. about 3.1 ms per step. This is a good result for CPU logic in this environment, but it says nothing about Canvas fill rate, GC on mobile Chrome, GPU compositing, thermal throttling, or Safari.

A more noticeable architectural problem was found in the world geometry. After the city is built, the runtime contains roughly 1837 buildings, 7770 containers, and about 503 thousand rectangular wall segments. The spatial grid reduces the cost of freeSpot/collision queries during play, so half a million objects do not necessarily mean half a million checks every frame. Nevertheless every such object has a creation, storage, and GC bookkeeping cost, which agrees well with the heavy boot and large heap footprint.

Here it is a higher priority to optimize the representation of static geometry rather than prematurely rewrite the whole AI. A practical option is to keep the current external wallsNear/rayWall API but internally move static rectangles to a chunked packed representation: typed arrays, an RLE/bitmask grid, or compact per-chunk structures. A single cell/segment does not need a full JS object with a property dictionary. The trade-off is harder debugging and the need for an adapter for the existing collision functions.

The next candidate is lazy materialization. If interior furniture, containers, auxiliary walls, and decoration are created for the whole city in newWorld, it is more advantageous to create them per chunk or for buildings within the player's active radius. This potentially improves boot and peak memory without changing the deterministic world logic, provided the seed and generation order are isolated per building/chunk id.

The AI also has reasonable potential for multi-rate simulation: combat and near-player NPCs update at 60 Hz, distant idle/perception logic at, say, 10–20 Hz, and the population director even less often. But this is so far an optimization candidate, not a proven hotspot: no separate V8 CPU flamegraph was taken for enemies.js. Before such a change it is better to profile a real browser first.

For 60 fps the browser must fit JavaScript, layout, drawing, and compositing into a single frame budget of about 16.7 ms; web.dev directly recommends evaluating work within the frame budget, not only the average time of individual functions. [1] Therefore the acceptance criterion must take P95/P99 frame time into account, not "average FPS".

I would fix the practical performance gate for v73/v74 as follows: dense-night 600–760 NPCs; P95 simulation step ≤4 ms on the target mobile device; P95 total frame ≤16.7 ms for the 60 fps mode or ≤33.3 ms for an officially chosen 30 fps mode; no long GC stalls >50 ms in a typical 5–10 minute raid; city boot substantially below the current headless level after the static geometry is optimized.

## Map, roads, bridges, and building accessibility

The size of the new map does match the changelog: the world data gives approximately 2918 × 1946 m, 16 districts, and 7 bridges (CHANGES_V73.md:3; road_network.json: mapWidth=1536, mapHeight=1024, rasterDownscale=2; world15.js).

A static check of the road raster found four separate components before the bridge connections were counted. At first glance this looked like a serious defect, but checking the ends of all seven bridges showed that the bridges link these components to each other. After the bridges are added as edges, the component graph becomes connected. Therefore the claim "the city road network is broken" is not confirmed.

This is, however, only topological connectivity. It does not prove that a car physically passes over each bridge, that A* uses the same transitions, that the collision mask leaves no step at the bank/deck joint, or that the rail walls do not create a bottleneck. The bridge implementation deliberately adds invisible side collision walls at a 6 px step (modules/bridges.js:110–119), while the carriageway and the railings are built independently (:68–106). So a dynamic traversal test is needed here.

A strong positive result — the runtime road/building audit returned conflictingBuildings: 0 and unresolvedBuildings: 0; this agrees with the statement in CHANGES_V73.md:6 about zero buildings on the road. But the current check is not strict proof of the advertised distance "≥5.2 m from the asphalt edge": for that, one should measure the minimum geometric distance from each building polygon to the continuous road envelope, not just cell occupancy.

The situation with building entrances is less clear-cut. At runtime 1837 buildings were found, of which about 1782 have interior structures. 1534 exterior entry-door objects were found. A simple freeSpot() check directly at the door center turned out negative almost always, but this is not a defect: the center of a doorway lies on the boundary of/inside the wall geometry, so such a test is methodologically wrong.

The geometry of the approach to a door is more useful. The distances to the nearest road sample have a wide tail: median about 18.5 m, P90 about 76.8 m, P95 about 104 m, maximum about 182 m; 478 entrances are farther than 30 m from the nearest road sample. This does not mean 478 buildings are inaccessible: a yard, a sidewalk, a private plot, and an inner driveway may be deliberately far from the road centerline. But the statistics show that the rule "the door faces the road" cannot be considered sufficient proof of actual accessibility.

A proper regression test should, for each door, compute the facade normal, place a point roughly 0.8–1.2 m outside and a separate point inside, and then check: the outer point is free; the segment between them passes only through the corresponding door opening; a walkable path exists from the outer point to the sidewalk/road-access graph; the result is logged by building id, district, and building type. Acceptable distances must differ for private houses and industrial zones, otherwise the test will create false defects.

For bridges the acceptance criterion must be dynamic: a car crosses each of the seven bridges in both directions with no collision stall >2 s, does not enter the water mask, and is not thrown out over a railing; the NPC pathfinder can build and walk a route between the banks; after crossing, the correct road classification is kept.

## Saves and security

Stash saving is implemented correctly with respect to the current specification. freshSave() contains the stash and character data, loadSave() loads v===1, and the death interface explicitly states that the raid cargo is lost but the stash remains (game.js:13–21, game.js:1397, index.html:199–201). No fix is needed here.

The real risk lies in the evolution of the format. Currently loadSave() accepts an object only when j.v === 1; any other version id leads to freshSave(). After loading there is only a partial safeguard for a missing nodes (game.js:21), but there is no full schema normalization. This means that if the structure changes in the future there is a risk of either silently starting a new game or accepting an incomplete v1 and crashing later when a missing nested field is accessed.

Three operations need to be separated: parse, normalize, and migrate. normalizeSave() should fill in missing valid values field by field without overwriting the stash; migrateSave() should convert step by step v1 → v2 → v3; before migration it is desirable to keep a backup of the original JSON string. This should be done before the first change of the save schema version, otherwise the current saveKey: 'wastland.save.v1' string turns into technical debt (config.js:113).

A separate documentation/launch defect: the README suggests simply opening index.html (README.md:3). MDN warns that localStorage behavior for file: URLs is not standardized and may differ between browsers. [2] For a game with persistent progress it is more correct to officially run the build through a minimal local HTTP server or a packaged webview. Read/write errors are currently completely swallowed (game.js:19–20), so the player may not know that progress is in fact not being saved.

On DOM security, no dangerous eval() or new Function() was found in the checked code. No network code that directly mixes in remote user content was found either. Therefore there is no proven XSS exploitation in the current offline build.

Nevertheless there are several innerHTML sinks: game.js:1305, 1358, 1373, 1397, 1425; modules/start.js:132–159; modules/map.js:105, 150; modules/shop.js:74. While the strings come from the game's own tables, the practical risk is limited. But if import of saves, mods, player names, cloud data, server events, or user-defined labels appear later, these same sinks become a potential DOM-XSS entry point. MDN explicitly classifies assigning strings to innerHTML as a risk with untrusted data, and OWASP recommends textContent/createElement for plain text. [3]

index.html also has no CSP, and some resources/styles and an inline script complicate enabling one immediately. A CSP is useful as an additional layer of defense against XSS, but simply inserting a strict policy without refactoring the inline script/style is not possible — it could break loading. MDN recommends CSP as one layer of XSS protection. [4]

The recommended order here: first replace data-dependent innerHTML where only text is needed; then add a test with synthetic strings such as <img ...> and make sure they are displayed literally; only then design CSP and Trusted Types, if Block‑96 becomes a networked or moddable application.

## Mobile rendering, documentation, and test tooling

The renderer already has several good safeguards. DPR is capped at 1.5 (game.js:38–43), which substantially limits the number of physical pixels on Retina/4K; buildings have a spatial index instead of a walk over the whole city (game.js:50–72); the main loop runs through requestAnimationFrame (game.js:1484–1488). This is the right direction.

The most suspicious mobile area is the current fog-of-view. modules/vision.js creates an offscreen canvas of the same physical size as the main canvas (:69–73), clears and fully fills it every frame (:75–76), cuts out visibility polygons, then composites the whole overlay back onto the main canvas twice: first saturation, then ordinary source-over (:79–81). At DPR 1.5 on a 2400×1080 screen that is already millions of pixels per full-screen pass, and there are several such passes. This is not a proven bottleneck without a GPU trace, but by architecture it is one of the first places worth measuring on a phone.

There is a low-risk optimization for fog: the visibility mask can be rendered at half resolution and stretched at composite time. The loss of sharpness of the gray boundary is usually visually negligible, and the fill area drops roughly fourfold. A more aggressive option is dynamic resolution: when P95 frame time worsens, reduce the DPR of the game canvas from 1.5 to 1.25/1.0, leaving the DOM UI at native CSS resolution.

OffscreenCanvas/Worker can also help with heavy pre-rendering of static chunks or terrain baking; web.dev notes that OffscreenCanvas lets canvas work be separated from the DOM/main thread. [5] But moving the whole game there before profiling is not advisable: the complexity of state synchronization and input latency may exceed the gain. For static layers, pre-rendering off-screen is a standard Canvas optimization. [6]

A minor extra: modules/map.js:166–167 keeps its own permanent requestAnimationFrame(poll), although the useful work is done only about every 500 ms. This is not the main bottleneck, but it could be replaced with a less frequent timer or the polling could be integrated into the main loop.

The documentation needs separate cleanup. The PDF presentation and the collage belong to a substantially earlier version, v33: they show 15 districts and the outdated stash-loss rule. The current v73 has 16 districts (CHANGES_V73.md:3), and the stash is kept. The README also mixes eras: it correctly describes the persistent stash (README.md:24) while still referring to the missing/outdated pavlov_yar.js, districts2.js, the former geometry, and a "Not done yet" section that no longer matches the set of modules (README.md:5–17, 29–45). This is a confirmed documentation defect, not a game defect.

The test harness has an even more concrete reproducibility problem: its default root is historically tied to an external path, so in the current build running it requires B96_ROOT=$PWD. It is more reliable to compute the root as path.resolve(__dirname, '..'). The absence of package.json makes the test suite even less self-documenting.

In addition, the behavior/gangs tests repeatedly bring up the whole city anew. With a boot of several seconds, this turns even a relatively small suite into a multi-minute test, and in a constrained environment it times out before reaching the final summary. In gangs.test.js, in the checked run, a long series of scenarios passed without an assertion failure until the timeout, but a full 142/142 pass is not confirmed in this audit. Likewise, the line from CHANGES_V73.md cannot be repeated as fact.

The best test separation: test pure faction/stance functions without the city; the AI state machine on a minimal fixture world; population/map generation with one boot per seed; bridge/building accessibility in separate deterministic audit tests; keep the full city boot for an integration smoke test. This gives both a faster suite and more precise localization of regressions.

## Fix priorities and release criteria

| Priority | Change | Where | Trade-off | Acceptance criterion |
| --- | --- | --- | --- | --- |
| P0 | Fix the PPS test semantics; select a real patrol | tests/behavior.test.js, enemies.js if necessary | minimal risk if only the test is changed; higher risk when reusing sq.post | The PPS sequence passes on a series of seeds; the test always selects a squad of 3 |
| P0 | Make the test root portable | tests/harness.js | practically none | node tests/behavior.test.js works from a checkout without B96_ROOT |
| P1 | Introduce normalizeSave() and versioned migrations | game.js, config.js | a small increase in save code | a malformed/partial v1 does not lose a valid stash; v1→v2 has a fixture test |
| P1 | Add door-access and bridge-traversal audits | new tests/map*.test.js | the tests need a careful geometric model | 100% of the declared exterior entries have a valid approach or an explicitly marked exception; all 7 bridges are passable |
| P1 | Reduce the cost of static walls | sim.js/world generation | more complex collision storage | substantially lower boot/heap with an identical collision-result corpus |
| P1 | Profile and optimize fog | modules/vision.js | half-res slightly softens the fog boundary | P95 frame time meets the mobile target without changing visibility rules |
| P1 | A proper benchmark harness | tests/ | a small piece of infrastructure | warm-up, P50/P95/P99, several seeds, separate sim/render metrics |
| P2 | Remove data-dependent innerHTML | game.js, modules/*.js | more DOM code | hostile strings are displayed as text and not executed |
| P2 | Update the README/PDF | documentation | no runtime risk | 16 districts, v73, the current load order, persistent stash, current features |
| P2 | Standardize launching over HTTP | README/dev tooling | a simple server command is needed | saves behave the same in supported browsers |

The regression suite after these fixes should cover one chain from the low level to a real device: syntax of all JS; pure-unit faction/stance/save migration; the AI state machine with deterministic seeds; a population census; road+bridge topology; physical bridge traversal; door accessibility; save/death/evacuation; XSS-sink fixtures; headless performance with percentile metrics; a browser smoke test with Canvas; then a real Android/iOS performance pass. Only the last stage allows one to say reliably that v73 handles hundreds of NPCs on the target mobile platform.

The final technical assessment after re-verification is noticeably milder than the previous one regarding the AI and the map: no confirmed breakage of the PPS logic was found, a defect in the test selector is confirmed; no topological break in the road network was found once bridges are counted; buildings-on-roads are not reproduced. The main real risks of v73 now are an expensive initialization of a large world, a very large representation of static collision geometry, the lack of strict verification of the accessibility of all entrances, the lack of versioned save migration, a non-portable/slow test harness, a potentially expensive full-resolution fog on phones, and strongly outdated documentation.

[1] [5] OffscreenCanvas—speed up your canvas operations with a web worker  |  Articles  |  web.dev

https://web.dev/articles/offscreen-canvas?authuser=531874696&utm_source=chatgpt.com

[2] Window: localStorage property - Web APIs | MDN

https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage?kbid=111697&utm_source=chatgpt.com

[3] DOM based XSS Prevention - OWASP Cheat Sheet Series

https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html?utm_source=chatgpt.com

[4] Cross-site scripting (XSS) - Security | MDN

https://developer.mozilla.org/en-US/docs/Web/Security/Attacks/XSS?utm_source=chatgpt.com

[6] Improving HTML5 Canvas performance  |  Articles  |  web.dev

https://web.dev/articles/canvas-performance?utm_source=chatgpt.com
