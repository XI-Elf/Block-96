extends Node2D
## Single-player client: input -> command -> GameState.step -> rendering.

const LEVEL_PATH := "res://data/levels/pavlov_yar.json"
const PLAYER_ID := 1
const TRACER_TTL := 0.12

var level: Level
var state: GameState
var camera: Camera2D
var hud: Label
var tracers: Array = [] # {from, to, ttl}
var aim_point := Vector2.ZERO


func _ready() -> void:
	level = Level.load_from(LEVEL_PATH)
	state = GameState.new(1)
	state.walls = level.walls
	state.water = level.water
	state.walkable = level.walkable
	state.add_player(PLAYER_ID, level.spawn)
	camera = Camera2D.new()
	camera.zoom = Vector2(0.6, 0.6) # zoomed out so the high-rises are visible at once
	add_child(camera)
	var layer := CanvasLayer.new()
	hud = Label.new()
	hud.position = Vector2(16, 12)
	layer.add_child(hud)
	add_child(layer)
	Input.mouse_mode = Input.MOUSE_MODE_HIDDEN


func _physics_process(dt: float) -> void:
	var cmd := {
		"pid": PLAYER_ID,
		"move": _read_move(),
		"aim": aim_point,
		"fire": Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT),
		"reload": Input.is_physical_key_pressed(KEY_R),
	}
	for e in state.step([cmd], dt):
		if e.type == "shot":
			tracers.append({"from": e.from, "to": e.to, "ttl": TRACER_TTL})
	for t in tracers:
		t.ttl -= dt
	tracers = tracers.filter(func(t): return t.ttl > 0.0)


func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode == KEY_F5:
			SaveGame.save(state)
		elif event.physical_keycode == KEY_F9:
			SaveGame.load_into(state)


func _process(_dt: float) -> void:
	var p: Dictionary = state.players[PLAYER_ID]
	camera.position = Iso.to_screen(p.pos)
	aim_point = Iso.to_world(get_global_mouse_position())
	hud.text = "HP %d   Ammo %d/%d%s   [WASD] move  [LMB] fire  [R] reload  [F5] save  [F9] load" % [
		p.hp, p.ammo, GameState.MAG_SIZE, "  reloading..." if p.reload > 0.0 else ""]
	queue_redraw()


func _read_move() -> Vector2:
	var v := Vector2.ZERO
	# Controls are remapped so that W moves up on the screen (world axes are rotated 45 degrees).
	if Input.is_physical_key_pressed(KEY_W): v += Vector2(-1, -1)
	if Input.is_physical_key_pressed(KEY_S): v += Vector2(1, 1)
	if Input.is_physical_key_pressed(KEY_A): v += Vector2(-1, 1)
	if Input.is_physical_key_pressed(KEY_D): v += Vector2(1, -1)
	return v.normalized() if v != Vector2.ZERO else v


func _poly_screen(poly: PackedVector2Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for p in poly:
		out.append(Iso.to_screen(p))
	return out


func _fill(poly: PackedVector2Array, col: Color) -> void:
	if poly.size() >= 3 and not Geometry2D.triangulate_polygon(poly).is_empty():
		draw_colored_polygon(_poly_screen(poly), col)


func _line_world(pts: PackedVector2Array, col: Color, width: float) -> void:
	for i in range(pts.size() - 1):
		draw_line(Iso.to_screen(pts[i]), Iso.to_screen(pts[i + 1]), col, width)


func _draw() -> void:
	if level == null:
		return
	var s := level.size
	_fill(PackedVector2Array([Vector2(0, 0), Vector2(s.x, 0), s, Vector2(0, s.y)]), Color("1b1f2a"))
	for pk in level.parks:
		_fill(pk, Color("243c2c"))
	for w in level.water:
		_fill(w, Color("284670"))
	for r in level.roads:
		var col := Color("4d4d58") if r.type == "main" else Color("42424e")
		for poly in r.polys:
			_fill(poly, col)
	for st in level.streets:
		for poly in Geometry2D.offset_polyline(st, 3.0):
			_fill(poly, Color("3a3a46"))
	for rw in level.railways:
		_line_world(rw, Color("14141a"), 3.0)
		_line_world(rw, Color(0.7, 0.7, 0.7, 0.5), 1.0)
	for br in level.bridges:
		for poly in br.polys:
			_fill(poly, Color("736a60"))
	# buildings, barriers, booths and the player in depth order (rough sort by x+y)
	var items: Array = []
	for b in level.buildings:
		items.append({"key": b.rect.end.x + b.rect.end.y, "b": b})
	var p: Dictionary = state.players[PLAYER_ID]
	items.append({"key": p.pos.x + p.pos.y + 1.0, "player": true})
	items.sort_custom(func(a, b): return a.key < b.key)
	var player_screen := Iso.to_screen(p.pos)
	var player_key: float = p.pos.x + p.pos.y + 1.0
	for it in items:
		if it.has("b"):
			# fade buildings that stand in front of the player and cover them on the screen
			var fade: bool = it.key > player_key and _screen_box(it.b).has_point(player_screen)
			_draw_building(it.b, 0.3 if fade else 1.0)
		else:
			_draw_player(p)
	# player silhouette on top of buildings when hidden behind them
	draw_circle(Iso.to_screen(p.pos), 9.0, Color(1, 1, 1, 0.35))
	for t in tracers:
		draw_line(Iso.to_screen(t.from), Iso.to_screen(t.to), Color(1, 1, 1, 0.9), 2.0)
	_draw_aim(p)


const KIND_COLORS := {
	"house": [Color("3a3f55"), Color("2c3045"), Color("4b5170")],
	"garage_row": [Color("45454f"), Color("33333c"), Color("585865")],
	"shed": [Color("4a3f3a"), Color("372f2b"), Color("5e504a")],
	"panel": [Color("6b7388"), Color("4f566b"), Color("8a93a8")],
	"barrier": [Color("7a2f2f"), Color("5a2222"), Color("9a4040")],
	"booth": [Color("55604a"), Color("3f4837"), Color("6d7a5e")],
}


func _screen_box(b: Dictionary) -> Rect2:
	var r: Rect2 = b.rect
	var top: float = -b.h * Iso.PX_PER_M_HEIGHT
	var left := Iso.to_screen(Vector2(r.position.x, r.end.y)).x
	var right := Iso.to_screen(Vector2(r.end.x, r.position.y)).x
	var up: float = Iso.to_screen(r.position).y + top
	var down := Iso.to_screen(r.end).y
	return Rect2(left, up, right - left, down - up)


func _draw_building(b: Dictionary, alpha: float = 1.0) -> void:
	var r: Rect2 = b.rect
	var cols: Array = KIND_COLORS.get(b.kind, KIND_COLORS.house)
	var h := Vector2(0, -b.h * Iso.PX_PER_M_HEIGHT)
	var a := Iso.to_screen(r.position)
	var bb := Iso.to_screen(Vector2(r.end.x, r.position.y))
	var c := Iso.to_screen(r.end)
	var d := Iso.to_screen(Vector2(r.position.x, r.end.y))
	draw_colored_polygon(PackedVector2Array([d, c, c + h, d + h]), Color(cols[0], alpha))
	draw_colored_polygon(PackedVector2Array([bb, c, c + h, bb + h]), Color(cols[1], alpha))
	draw_colored_polygon(PackedVector2Array([a + h, bb + h, c + h, d + h]), Color(cols[2], alpha))
	if b.kind == "panel" and alpha >= 1.0:
		_draw_windows(r, b.h)


func _draw_player(p: Dictionary) -> void:
	var sp := Iso.to_screen(p.pos)
	draw_circle(sp, 9.0, Color("e8e8f0"))
	draw_line(sp, Iso.to_screen(p.pos + p.dir * 0.8), Color("ff3d81"), 3.0)


# Crosshair: a straight line and a cross of one colour, no range indication.
func _draw_aim(p: Dictionary) -> void:
	var dist := minf((aim_point - p.pos).length(), state.ray_cast(p.pos, p.dir, GameState.MAX_RANGE))
	var end: Vector2 = p.pos + p.dir * dist
	var from_s := Iso.to_screen(p.pos)
	var end_s := Iso.to_screen(end)
	draw_line(from_s, end_s, Color(1, 1, 1, 0.6), 1.0)
	draw_line(end_s + Vector2(-8, 0), end_s + Vector2(8, 0), Color.WHITE, 2.0)
	draw_line(end_s + Vector2(0, -8), end_s + Vector2(0, 8), Color.WHITE, 2.0)


# Window rows on the two visible faces of a panel high-rise; a few windows are lit.
func _draw_windows(r: Rect2, height: float) -> void:
	var floors := int(height / 3.0)
	for f in range(floors):
		var z := (f + 0.5) * 3.0
		var up := Vector2(0, -z * Iso.PX_PER_M_HEIGHT)
		# face along x (the one at the larger y) and face along y (at the larger x)
		var n_x := int(r.size.x / 2.5)
		for i in range(n_x):
			var wx := r.position.x + (i + 0.5) * r.size.x / n_x
			var pos := Iso.to_screen(Vector2(wx, r.end.y)) + up
			var lit := (int(wx * 7.0) * 31 + f * 17) % 5 == 0
			draw_rect(Rect2(pos - Vector2(3, 5), Vector2(6, 9)), Color("ffd27a") if lit else Color("1d2130"))
		var n_y := int(r.size.y / 2.5)
		for i in range(n_y):
			var wy := r.position.y + (i + 0.5) * r.size.y / n_y
			var pos2 := Iso.to_screen(Vector2(r.end.x, wy)) + up
			var lit2 := (int(wy * 11.0) * 29 + f * 13) % 6 == 0
			draw_rect(Rect2(pos2 - Vector2(3, 5), Vector2(6, 9)), Color("7ad7ff") if lit2 else Color("151927"))
