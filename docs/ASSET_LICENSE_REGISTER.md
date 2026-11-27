# Block-96 asset and license register (build v75)

Scope: every non-code asset and third-party dependency in `block96-js-v75.zip`, as audited on 2026-11-27.
Status legend: **VERIFIED** (checked in the build or repository), **UNVERIFIED** (provenance not recorded anywhere in the repository; the owner must confirm), **N/A**.

> Blocking finding: the repository has **no LICENSE file** and no recorded origin for any raster asset. Until the owner fills the "Origin / tool / terms" column, none of the 17 PNG files can be declared safe for public or commercial release.

## 1. Raster assets (`assets/`)

All files are PNG, 8-bit. "First seen" comes from byte comparison with the v61, v63 and v73 release archives. All 15 tiles differ from v73, so they were replaced between v73 and v75, likely by the owner's GitHub commits ("15 textures"); who or what produced the new images is not recorded.

| File | Size px | Used by | First seen | Origin / tool / terms | Status |
|---|---|---|---|---|---|
| asphalt.png | 512x512 | road surface (`game.js` TEX) | in v63, replaced in v75 | Probably owner-generated (project prompts in `block96/texture-prompts/`); generator and terms not recorded | UNVERIFIED |
| concrete.png | 512x512 | ground base | in v63, replaced in v75 | same | UNVERIFIED |
| earth.png | 512x512 | parks | in v63, replaced in v75 | same | UNVERIFIED |
| pave.png | 512x512 | sidewalks | in v63, replaced in v75 | same | UNVERIFIED |
| roof.png | 512x512 | roofs | in v63, replaced in v75 | same | UNVERIFIED |
| wall.png | 292x240 | default facade | in v63, replaced in v75 | same | UNVERIFIED |
| floor.png | 512x512 | interiors (generic) | in v63, replaced in v75 | same | UNVERIFIED |
| rust.png | 512x512 | loaded, not drawn | in v63, replaced in v75 | same | UNVERIFIED |
| wall_panel_grey.png | 292x240 | facade variant (v68 materials) | in v73 (v68), replaced in v75 | same | UNVERIFIED |
| wall_panel_ochre.png | 292x240 | facade variant | in v73 (v68), replaced in v75 | same | UNVERIFIED |
| wall_brick.png | 292x240 | facade variant | in v73 (v68), replaced in v75 | same | UNVERIFIED |
| wall_stucco.png | 292x240 | facade variant | in v73 (v68), replaced in v75 | same | UNVERIFIED |
| floor_linoleum.png | 512x512 | interior floor | in v73 (v68), replaced in v75 | same | UNVERIFIED |
| floor_parquet.png | 512x512 | interior floor | in v73 (v68), replaced in v75 | same | UNVERIFIED |
| floor_tile.png | 512x512 | kitchen/bath floor | in v73 (v68), replaced in v75 | same | UNVERIFIED |
| props.png | 1774x887 sheet | birch tree, street lamp (crate/dumpster reserved) | v61 or earlier, unchanged | Not recorded | UNVERIFIED |
| cars.png | 1254x1254 sheet | legacy, **not loaded** (cars are procedural; only behind `B96_CARSPRITE`) | v61 or earlier, unchanged | Not recorded | UNVERIFIED; candidate for removal from the shipped build |

Notes:
- "Probably owner-generated" is an inference: the project workflow is that the team writes prompts and the owner generates images, and the files differ from v73. It is not documented per file. Confidence: medium.
- `docs/handoff/references/` (videos, PDFs) is described in `SOURCES.md` as a private package. Those videos are **references, not assets**, and must not be committed to the public repository.
- `qa/preview-lineup.png`, `qa/preview-states.png`: screenshots of the game itself; inherit the status of the assets they show.

## 2. Fonts

| Font | Where | Delivery | License (expected) | Status |
|---|---|---|---|---|
| Chakra Petch (500, 600, 700) | `index.html` line 6, CSS `--f-display` | Runtime request to `fonts.googleapis.com` (not bundled) | SIL Open Font License 1.1 | Expected from Google Fonts catalogue; **re-check** on the font page before release |
| JetBrains Mono (500, 700) | same | same | SIL Open Font License 1.1 | same |

Risks: the game needs a network connection to Google at start to get these fonts, and every player's IP reaches a third party. Fix options for Visual V2: self-host the WOFF2 files with the OFL text, or fall back to system fonts. Code change is outside this task.

## 3. Audio

- No audio files are shipped. [VERIFIED] `game.js` creates a Web Audio context and synthesises noise buffers in code (`game.js:421`). No `.mp3/.ogg/.wav` references in any source file.
- Nothing to register until recorded sounds are added. Any future sound must be added to this table before merge.

## 4. Third-party code

- [VERIFIED] No vendored libraries, no CDN `<script src>` tags, no `package.json`, no `node_modules` in the build. All game scripts are first-party.
- Dev-only: `tests/*.js` use Node built-ins (`fs`, `path`, `vm`, `node:crypto`, `node:perf_hooks`) and `playwright` (profiling script only; Apache-2.0). Not shipped to players.
- Technical reference links in `docs/handoff/SOURCES.md` (OpenXRay, Cataclysm: DDA, Suroi, Recast/Detour, PixiJS and others) are reading material. [VERIFIED] No code from them is in the build. If any is copied later, add its license here first.

## 5. Text and data

| Item | Origin | Status |
|---|---|---|
| `assets/graffiti_quotes.json` | Original placeholder phrases (per `CHANGES_V71.md`); not copied from any third-party board | VERIFIED as original; owner may replace with own text |
| `road_network.json/.js`, `world15.js` | Generated from the owner's hand-drawn map in the map editor | Owner's work |
| Lore, names, README text | Project authors | Owner's work |

## 6. Reference-only material (never an asset)

S.T.A.L.K.E.R. and Project Zomboid are mood and technique references only. No texture, sprite, sound, model, icon or UI element from them, from other commercial games, or from the owner's reference videos may be placed in `assets/`. The owner's two reference videos stay private.

## 7. Rules for Visual V2 additions

1. Every new file gets a row here in the same commit: path, size, usage, author or tool, exact tool terms or license, modification notes.
2. Acceptable sources: (a) created by the owner or the team, (b) AI-generated where the tool's terms allow the intended use (record tool, date, and a link to the terms; keep the prompt in `block96/texture-prompts/`), (c) CC0 or equivalent (record URL and date). Anything "free to view" or "found online" is rejected.
3. Prompts must not name living artists, commercial games or brands, and must forbid text and logos (Cyrillic breaks in generators; logos create legal risk).
4. No file ships without a row. A CI/test check that every file in `assets/` is listed in this register is recommended (needs code; hand to the code thread).

## 8. Open questions for the owner

1. Which tool generated each PNG batch, and under which plan or terms (commercial use allowed)? One line per batch is enough.
2. Source of `props.png` and `cars.png`.
3. Which license should the repository itself carry? Without one it is "all rights reserved" by default, which blocks contributors.
4. Fonts: self-host or accept the Google request?
