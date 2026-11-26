# Block-96 v71 — graffiti system + v70 interior clearance

- Adds editable original graffiti and stencil phrases on 2D projected building facades.
- Text placed only in available wall intervals between windows and doors, with stable per-building selection. About 27% of eligible faces are considered, and many are skipped when no room exists.
- The facade text moves and scales with walls; no floating overlay over the camera.
- Edit phrases in `modules/graffiti.js`; matching reference list in `assets/graffiti_quotes.json`.
- Texts are original placeholders, NOT copies from the inaccessible Pinterest board. Exact quotations need screenshots or a text list from the user.
- Inherits v70 building land-use placement experiment and lower interior furnishing density. Its unresolved overlaps remain flagged; roads are not rerouted.
