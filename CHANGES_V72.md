# Block-96 v72: independent road network

- `road_network.json` is the canonical editable road source (road raster, road samples, roads and district polygons).
- `road_network.js` loads that source into the existing map, and `districtRoads(id)` derives a district-specific road raster from the same source.
- `world15.js` no longer embeds road geometry: geometry can be edited independently.
- At raid initialization, finalized enlarged buildings are checked against the road mask; conflicting cells are cleared and short detour strips are added around building footprints. Rendered mask, proximity checks and road samples are refreshed. The `city.roadAudit` object records changes.
- Caveat: local bypass geometry is a provisional raster routing algorithm, not a full road-graph optimizer. Connectivity, parking, accessibility, bridges, route continuity and gameplay are not yet verified in a running browser.
- Inherits v71 interior spacing and original graffiti placeholders; Pinterest text not transcribed.
