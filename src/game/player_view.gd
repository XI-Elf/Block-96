class_name PlayerView
extends Node2D
## Human figure, 1.75 m tall, drawn at its real scale (see Iso).

const PH := 39.19
const BODY_W := 0.5 # metres
var dir := Vector2.RIGHT


func _draw() -> void:
	var k := 45.25 # px per metre of ground distance
	draw_colored_polygon(_ellipse(Vector2.ZERO, BODY_W * 0.6 * k, BODY_W * 0.3 * k), Color(0, 0, 0, 0.35))
	var hw := BODY_W * 0.5 * k * 0.7
	# legs, torso, head
	draw_rect(Rect2(-hw, -0.85 * PH, hw * 2, 0.85 * PH), Color("2b3040"))
	draw_rect(Rect2(-hw * 1.1, -1.5 * PH, hw * 2.2, 0.7 * PH), Color("e8e8f0"))
	draw_circle(Vector2(0, -1.63 * PH), 0.12 * PH, Color("d9b79a"))
	# weapon along the aim direction, held at chest height
	var chest := Vector2(0, -1.25 * PH)
	draw_line(chest, chest + Iso.to_screen(dir * 0.7), Color("ff3d81"), 3.0)


func _ellipse(c: Vector2, rx: float, ry: float) -> PackedVector2Array:
	var out := PackedVector2Array()
	for i in 20:
		var a := TAU * i / 20.0
		out.append(c + Vector2(cos(a) * rx, sin(a) * ry))
	return out
