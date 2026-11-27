# v73 — new city map (drawn in the map editor)

- Map: user-drawn city (block96-city-map v1, 2918 x 1946 m): roads (highway / road / street), railway, river, bridges, zones, 16 districts.
- Road data: world15.js + road_network.js/json generated from the drawn map (tools/ in newmap folder of the project). Width blends smoothly where road classes meet.
- Buildings are generated per zone type: residential (panel blocks, row/L-shaped sectional blocks, private houses of 4 styles, garages), industrial (warehouses, factories, containers), public/municipal (school, kindergarten, clinic, post, administration, police, library, council: kind `civic`, `b.sub` style and a sign over the entrance), forests/parks (trees). Max 5 floors.
- Buildings keep >= 5.2 m from the asphalt edge (the pavement band is drawn 4.7 m wide); no building on a road or pavement (audit: 0 of 1837).
- Bins in groups of 2-4 at the ends of panel blocks, one bin at a house gate, containers at warehouse loading sides; no random scatter, no mailboxes on facades.
- Road rendering: pavement of all chunks is drawn first, then asphalt (no overlapping seams).
- Lamp rule from v72 applies to the new roads.
- Tests: gangs 139-142/142, behavior 55-60/60 (map-dependent night squad and warning-aim cases).

# v74
- Raid groups (squads, street gangs, night patrols) now have at most 3 members (`MAX_SQUAD` in enemies.js; street gangs were 3-5). Group templates and the per-district night targets are unchanged.
