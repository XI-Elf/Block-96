class_name GroundView
extends Node2D
## Static ground layer: land, park, water, roads, streets, railway, bridges. Drawn once.

var level: Level


func setup(lv: Level) -> void:
	level = lv
	z_index = -4000
	queue_redraw()


func _poly(poly: PackedVector2Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for p in poly:
		out.append(Iso.to_screen(p))
	return out


func _fill(poly: PackedVector2Array, col: Color) -> void:
	if poly.size() >= 3 and not Geometry2D.triangulate_polygon(poly).is_empty():
		draw_colored_polygon(_poly(poly), col)


func _draw() -> void:
	var s := level.size
	_fill(PackedVector2Array([Vector2(0, 0), Vector2(s.x, 0), s, Vector2(0, s.y)]), Color("1b1f2a"))
	for pk in level.parks:
		_fill(pk, Color("243c2c"))
	for w in level.water:
		_fill(w, Color("284670"))
	# curb underlay first (slightly wider), then asphalt, so crossings stay clean
	for st in level.streets:
		for poly in Geometry2D.offset_polyline(st.pts, st.w * 0.5 + 0.7, Geometry2D.JOIN_ROUND, Geometry2D.END_ROUND):
			_fill(poly, Color("2c2c36"))
	for r in level.roads:
		for poly in Geometry2D.offset_polyline(r.pts, r.w * 0.5 + 0.8, Geometry2D.JOIN_ROUND, Geometry2D.END_ROUND):
			_fill(poly, Color("2c2c36"))
	for st in level.streets:
		for poly in st.polys:
			_fill(poly, Color("3d3d49"))
	for r in level.roads:
		for poly in r.polys:
			_fill(poly, Color("4a4a56") if r.type == "main" else Color("41414d"))
		if r.type == "main":
			_dashed(r.pts, Color(1, 1, 1, 0.35))
	for rw in level.railways:
		for i in range(rw.size() - 1):
			draw_line(Iso.to_screen(rw[i]), Iso.to_screen(rw[i + 1]), Color("14141a"), 3.0)
	for br in level.bridges:
		for poly in br.polys:
			_fill(poly, Color("736a60"))


func _dashed(pts: PackedVector2Array, col: Color) -> void:
	for i in range(pts.size() - 1):
		var a := pts[i]
		var b := pts[i + 1]
		var n := int(a.distance_to(b) / 6.0)
		for k in range(0, n, 2):
			draw_line(Iso.to_screen(a.lerp(b, float(k) / n)), Iso.to_screen(a.lerp(b, float(k + 1) / n)), col, 2.0)
