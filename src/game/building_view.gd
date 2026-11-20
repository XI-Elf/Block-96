class_name BuildingView
extends Node2D
## One building, drawn once as oriented prism with facade details; depth via z_index.
## Heights range from single-storey private houses to 9-floor panel blocks.

const FLOOR_H := 2.8
const PH := 39.19 # = Iso.PX_PER_M_HEIGHT

const WALL := {
	"house": Color("5d6277"), "shed": Color("5e504a"), "garage_row": Color("585865"),
	"panel": Color("7a7d89"), "barrier": Color("8a3a3a"), "booth": Color("66724f"),
}

var b: Dictionary


func setup(building: Dictionary) -> void:
	b = building
	z_index = int(b.key * 4.0)
	queue_redraw()


func set_faded(on: bool) -> void:
	modulate.a = 0.3 if on else 1.0


func _h(p: Vector2, z: float) -> Vector2:
	return Iso.to_screen(p) + Vector2(0, -z * PH)


func _draw() -> void:
	var poly: PackedVector2Array = b.poly
	var c: Vector2 = b.center
	var base: Color = WALL.get(b.kind, WALL.house)
	var n := poly.size()
	for i in n:
		var p0 := poly[i]
		var p1 := poly[(i + 1) % n]
		var e := (p1 - p0)
		var edge_len := e.length()
		var u := e / edge_len
		var normal := Vector2(u.y, -u.x)
		if normal.dot((p0 + p1) * 0.5 - c) < 0.0:
			normal = -normal
		if normal.x + normal.y <= 0.05:
			continue # faces away from the camera
		var shade := 0.62 + 0.28 * clampf((normal.y - normal.x) * 0.7071 + 0.5, 0.0, 1.0)
		draw_colored_polygon(PackedVector2Array([_h(p0, 0), _h(p1, 0), _h(p1, b.h), _h(p0, b.h)]), Color(base * shade, 1.0))
		if b.kind == "panel":
			_facade_panel(p0, u, edge_len)
		elif b.kind == "house":
			_facade_house(p0, u, edge_len)
	var top := PackedVector2Array()
	for p in poly:
		top.append(_h(p, b.h))
	draw_colored_polygon(top, Color(base * 1.12, 1.0))
	if b.kind == "panel":
		_roof_panel()


func _quad(p0: Vector2, u: Vector2, s0: float, s1: float, z0: float, z1: float, col: Color) -> void:
	var a := p0 + u * s0
	var c := p0 + u * s1
	draw_colored_polygon(PackedVector2Array([_h(a, z0), _h(c, z0), _h(c, z1), _h(a, z1)]), col)


func _hash(f: int, i: int) -> int:
	return (int(b.key * 13.0) * 73856093 ^ f * 19349663 ^ i * 83492791) & 0x7fffffff


# CIS panel block, 2000s: floor seams, paired windows, glazed loggias, a few lit windows, neon strip.
func _facade_panel(p0: Vector2, u: Vector2, length: float) -> void:
	var floors := int(b.h / FLOOR_H)
	var bays := int(length / 3.0)
	if bays < 1:
		return
	var margin := (length - bays * 3.0) * 0.5
	for f in range(floors):
		var z0 := f * FLOOR_H
		draw_line(_h(p0, z0 + FLOOR_H), _h(p0 + u * length, z0 + FLOOR_H), Color(0, 0, 0, 0.18), 1.0)
		for i in range(bays):
			var s0 := margin + i * 3.0
			var hv := _hash(f, i) % 100
			var lit := hv < 22
			_quad(p0, u, s0 + 0.3, s0 + 1.3, z0 + 0.9, z0 + 2.2, Color("ffd27a") if lit else Color("1b1f2e"))
			if hv > 55:
				var glazed := Color("5d8f95") if hv < 80 else Color("3c4a63")  # enclosed loggia
				_quad(p0, u, s0 + 1.55, s0 + 2.75, z0 + 0.25, z0 + 1.75, glazed)
			else:
				_quad(p0, u, s0 + 1.6, s0 + 2.7, z0 + 0.9, z0 + 2.2, Color("232838"))
	if _hash(7, 3) % 3 == 0 and floors >= 5:  # sparse neon sign on a facade edge
		var col := Color("ff3d81") if _hash(1, 1) % 2 == 0 else Color("2fd7e6")
		_quad(p0, u, length - 1.4, length - 0.8, 4.0, b.h - 3.0, Color(col, 0.35))
		_quad(p0, u, length - 1.2, length - 1.0, 4.0, b.h - 3.0, col)
	# entrances at ground level
	var doors := int(length / 18.0)
	for k in range(doors):
		var s := 9.0 + k * 18.0
		_quad(p0, u, s - 0.8, s + 0.8, 0.0, 2.1, Color("2a2f3a"))


func _facade_house(p0: Vector2, u: Vector2, length: float) -> void:
	var floors := maxi(1, int(b.h / 3.0))
	var bays := int(length / 3.0)
	var margin := (length - bays * 3.0) * 0.5
	for f in range(floors):
		for i in range(bays):
			var lit := _hash(f, i) % 100 < 35
			var s0 := margin + i * 3.0 + 0.8
			_quad(p0, u, s0, s0 + 1.1, f * 3.0 + 1.0, f * 3.0 + 2.2, Color("ffcf70") if lit else Color("1c2030"))


func _roof_panel() -> void:
	var c: Vector2 = b.center
	var a := deg_to_rad(b.angle)
	var u := Vector2(cos(a), sin(a))
	var v := Vector2(-u.y, u.x)
	# elevator machine room
	var room := Level.footprint(c.x, c.y, 4.0, 3.0, b.angle)
	var top := PackedVector2Array()
	for p in room:
		top.append(_h(p, b.h + 2.6))
	for i in 4:
		var p0 := room[i]
		var p1 := room[(i + 1) % 4]
		var nrm := Vector2((p1 - p0).normalized().y, -(p1 - p0).normalized().x)
		if nrm.dot((p0 + p1) * 0.5 - c) < 0.0:
			nrm = -nrm
		if nrm.x + nrm.y > 0.05:
			draw_colored_polygon(PackedVector2Array([_h(p0, b.h), _h(p1, b.h), _h(p1, b.h + 2.6), _h(p0, b.h + 2.6)]), Color("4a4d59"))
	draw_colored_polygon(top, Color("6b6e7a"))
	# TV antennas and satellite dishes
	for k in range(3):
		var ap: Vector2 = c + u * (k - 1) * b.w * 0.3 + v * (k % 2 - 0.5) * b.d * 0.4
		draw_line(_h(ap, b.h), _h(ap, b.h + 4.5), Color("15171f"), 1.5)
		draw_line(_h(ap, b.h + 4.0) + Vector2(-6, 0), _h(ap, b.h + 4.0) + Vector2(6, 0), Color("15171f"), 1.5)
