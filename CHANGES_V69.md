# Block-96 v69: winter terrain, roads, buildings, lamps

- Removed diagonal hatch from rail/road-adjacent layer.
- Dark asphalt and lighter concrete sidewalk with stronger curb shadow and cap.
- Replaced green vegetation colors with dormant winter grasses and muted soil.
- Panel and house world footprints expanded sqrt(1.5) on both dimensions. World collision/interior plan generation uses expanded sizes.
- Five-storey panel facade seams are clearer, floors still render individually according to building height.
- Lamp diffuser illuminated on sprite; halo less point-like, position follows actual glass.

LIMITATIONS: footprint expansion can cause building-to-building or road intersections in dense areas. Requires spatial clearance audit. No real 3D height-mapped sidewalk collision; curb is rendered as visible elevation cue. Browser raid and FPS not fully validated.
