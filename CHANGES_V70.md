# Block-96 v70: space and layouts

- Residential building footprint stays 1.5x its original area, as in v69.
- Before building collision/interior generation, search offsets up to 15.5 metres for road-free ground and record `city.placementAudit` (expanded/moved/unresolved).
- Maintains a local grid against overlapping already-placed residential buildings. This is a conservative first-pass clearance; some buildings may remain unresolved.
- Housing room furnishing budgets reduced; door opening width increased; extra buffer from doors, windows and other furniture.
- Panel flats retain distinct kitchen, bath, hall, bedrooms, landing and stairs based on typical-floor references.
- Road network is NOT rerouted in this version: when no safe position is found, a building is flagged instead of silently moving the street and breaking navigation.
- Does not add traversable upper floors.
