class_name Iso
extends RefCounted
## 2:1 isometry (camera elevation 30 degrees, rotated 45 degrees).
## Ground scale: 1 world metre along an axis = (32, 16) px, i.e. 45.25 px per metre of ground distance.
## Vertical scale follows from the projection: 45.25 * cos(30 deg) = 39.19 px per metre of height.
## Real-world proportions used everywhere: human 1.75 m, floor 2.8 m, car 4.5 m.

const HALF_W := 32.0
const HALF_H := 16.0
const PX_PER_M_HEIGHT := 39.19
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
