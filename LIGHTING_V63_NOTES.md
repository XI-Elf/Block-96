# Block-96 v63 — Street lighting

Canvas 2D renderer: actual Godot/Unity Light2D/SpriteRenderer components are not available. Equivalent per-lamp metadata is stored in `s.map.walls` as `light2D`, `collider2D`, and `renderLayer`.

`light2D`: `position` (world coordinates, world pixels); `direction` (unit vector along road-facing normal); `spread_angle` (degrees); `intensity_distribution` (`wide`, `cosine4`, `narrow`); `intensity` and `range`.

The existing lamp sprite stays on the depth-sorted world-object layer; collider is the existing world wall AABB, with additional declarative circle metadata. This is *not* a new physical collision engine. In the light pass, houses occlude lanterns as before.

Placement: stand on the road verge rather than the carriageway, check collision using freeSpot, and apply minimum separation in road-sample mode. The road sample geometry is approximate, so individual placement validity in the running city is not guaranteed.

Render fix: removed hard trapezoid light cones, tied light direction to road geometry, added elliptical feathered falloff, weak suspended haze and a small warm bulb glow.

No scene-editor or per-lamp coordinate export is provided in this revision.
