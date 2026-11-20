class_name Iso
extends RefCounted
## Изометрия 2:1. 1 метр мира = 32 px по оси X экрана и 16 px по Y.

const HALF_W := 32.0
const HALF_H := 16.0
const PX_PER_M_HEIGHT := 24.0


static func to_screen(w: Vector2) -> Vector2:
	return Vector2((w.x - w.y) * HALF_W, (w.x + w.y) * HALF_H)


static func to_world(s: Vector2) -> Vector2:
	var a := s.x / HALF_W # x - y
	var b := s.y / HALF_H # x + y
	return Vector2((a + b) * 0.5, (b - a) * 0.5)
