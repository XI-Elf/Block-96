class_name Iso
extends RefCounted
## Orthographic camera rotated 45 degrees around the vertical axis, tilted to ELEVATION_DEG above the ground.
## Ground scale: 1 world metre along an axis = (32, HALF_H) px, i.e. 45.25 px per metre of ground distance;
## HALF_H = 32 * sin(elevation) and PX_PER_M_HEIGHT = 45.2548 * cos(elevation) (tests check these).
## At 55 degrees (like the owner's reference photo) tall buildings hide much less of the ground than at 30.
## Real-world proportions used everywhere: human 1.75 m, floor 2.8 m, car 4.5 m.

const HALF_W := 32.0
const ELEVATION_DEG := 55.0
const HALF_H := 26.2129
const PX_PER_M_HEIGHT := 25.9560
const FLOOR_HEIGHT_M := 2.8


static func to_screen(w: Vector2) -> Vector2:
	return Vector2((w.x - w.y) * HALF_W, (w.x + w.y) * HALF_H)


static func to_world(s: Vector2) -> Vector2:
	var a := s.x / HALF_W # x - y
	var b := s.y / HALF_H # x + y
	return Vector2((a + b) * 0.5, (b - a) * 0.5)


## Screen position of a point at height z (metres) above the ground point w.
static func to_screen_h(w: Vector2, z: float) -> Vector2:
	return to_screen(w) + Vector2(0, -z * PX_PER_M_HEIGHT)
