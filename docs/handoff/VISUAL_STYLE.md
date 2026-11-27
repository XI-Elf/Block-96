# Block-96 Visual Direction

## Basis
The owner showed two video references and clarified: "The graphics here are different. And the camera orientation. But this is what I want to see." Do not draw conclusions about the exact engine from the video; do not carry over the camera angle without a separate decision. The goal of the discussion is a living, dangerous, abandoned city with a post-apocalyptic atmosphere built on panel blocks and 2000s aesthetics, with more realistic materials and dynamic light. This is a proposed artistic standard that must be confirmed on a prototype.

The original video references: `VID_20261126_204249_801.mp4`, `VID_20261126_204315_835.mp4` (in the full package `docs/handoff/references/`).

## The v76 reference quarter
A street, a residential building with an interior, a commercial room, and an industrial object. The same camera and mechanics before/after. Prepare frames for day/dusk/night, combat, and entering a room. Agree on the visual standard before scaling it to the 16 districts.

| Element | What to do | Check |
|---|---|---|
| Materials | Varied asphalt, concrete, brick, plaster, floors, wear, dirt, cracks | No obvious tiling repetition; obstacles stay readable |
| Light and shadows | Local street lamps, natural falloff, blocking by obstacles; expressive day/night | Gameplay visibility is unchanged; light does not reveal a hidden NPC |
| Interiors | Detail by room purpose, furniture, and items | Passages and interactions stay accessible; visual details do not create unaccounted collision |
| Surroundings | Uneven vegetation, litter, traces of activity | Deterministic; does not hinder navigation if it is a decorative layer |
| Weather | Rain, fog, dampness, dust (per the approved style) | Graphics budget, separate quality toggles |
| Combat | Flashes, smoke, hits, and feedback | Readability and no significant frame drops |
| Animations | Natural movement and interaction | Gameplay state and animation stay in sync |
| UI | A restrained palette, readable items and icons | Mobile controls, contrast, element sizes |

## Technical principles
Cache static layers by spatial region with a memory budget; draw dynamic NPCs, vehicles, light, and effects separately and only as needed. Do not apply an expensive effect to the whole city before profiling. Keep an asset registry: source, author, license, modifications, size, and purpose. Do not copy protected game assets from the references. Keep the previous rendering mode, or keep the change reversible, until the new one is approved.
