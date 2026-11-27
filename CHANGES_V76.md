# v76
Stage v74.6-v74.8 of `docs/BLOCK96_DEVELOPMENT_PLAN.md` plus privacy and control-scene requests.
- Saves: `modules/save.js` - versioned format (v2), step migrations, normalisation, `.premigrate` / `.bak` / `.corrupt` copies, read-back verification, visible errors, write-off for newer formats. Stash rules unchanged.
- Safe DOM: `modules/dom.js`; every data-dependent `innerHTML` (HUD slots, inventory, character, shop, prep, found-loot panel, result list, map, start screen) now goes through escaped templates or `createElement`.
- Fonts: Chakra Petch and JetBrains Mono are self-hosted (`assets/fonts/`, OFL texts included); the Google Fonts link is removed, no third-party requests.
- `assets/cars.png` removed (never loaded; cars are drawn from primitives) together with the dead sprite branch in `game.js`.
- `?seed=N` and `?at=x,y` URL parameters for control scenes; snow flurries are deterministic with `?seed`.
- `tests/save-dom.test.js` (37 checks); `tests/profile-browser.js` takes `B96_CHROMIUM`.
- README: save, safe-DOM, font, URL-parameter and baseline sections.
- Not changed: balance, camera, city, population, AI. Known: gangs test (Vyshka night, 11 < 12) fails as in v75.
- Open from the passability report: bridges M5 and M7 and door openings (planned for the v77 stage).
