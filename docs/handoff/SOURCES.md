# Sources and Limitations

## Project materials
The full package `docs/handoff/references/` holds the unmodified originals: the original v73 ZIP, the technical audit DOCX, two PDFs, and two MP4s. The audit text is duplicated in `AUDIT_V73.md` for the agent's convenience. The game files in the root were extracted from the original ZIP without modification. The PDFs describe an older version: use them as historical context.

## Technical references
The links below are starting material for independent study; they are not proof of the internals of closed games. Re-check current technical details and licenses before applying anything.
- Cataclysm: DDA — https://github.com/CleverRaven/Cataclysm-DDA
- OpenXRay — https://github.com/OpenXRay/xray-16
- Suroi — https://github.com/HasangerGames/suroi
- Recast/Detour — https://github.com/recastnavigation/recastnavigation
- Project Zomboid — https://projectzomboid.com/blog/
- GDC — https://www.gdcvault.com/ (search for AI Recycling and Horizon Zero Dawn AI)
- MDN Canvas optimization — https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
- OffscreenCanvas — https://web.dev/articles/offscreen-canvas
- Canvas performance — https://web.dev/articles/canvas-performance
- MDN localStorage — https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
- MDN IndexedDB — https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- OWASP DOM XSS prevention — https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html
- PixiJS — https://pixijs.com/
- OpenAI Codex workflow guide — https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex

## Limitations
The conversation is presented as a digest, not a complete verbatim export. While the package was assembled there were no new runs of the game or tests, no new mobile profiling, and no implementation of updates. The v73 data comes from the attached audit and the earlier discussion; verify it against the current code. The closed code of commercial games was not examined directly. The result of the separate Deep Research on the roadmap was not available in the conversation. The graphics/architecture recommendations are proposed, not implemented, changes.
