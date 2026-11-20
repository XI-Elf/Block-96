extends Node2D
## Single-player client: input -> command -> GameState.step -> rendering.

const LEVEL_PATH := "res://data/levels/pavlov_yar.json"
const PLAYER_ID := 1
const TRACER_TTL := 0.12
const CHEST_M := 1.25 # weapon height
const ZOOM_DEFAULT := 1.4
const ZOOM_MIN := 0.6
const ZOOM_MAX := 2.5

var level: Level
var state: GameState
var camera: Camera2D
var hud: Label
var tracers: Array = [] # {from, to, ttl}
var aim_point := Vector2.ZERO
var player_view: PlayerView
var building_views: Array[BuildingView] = []
var overlay: Node2D # aim line, crosshair and tracers (drawn above everything)


func _ready() -> void:
	level = Level.load_from(LEVEL_PATH)
	state = GameState.new(1)
	state.set_walls(level.walls)
	state.water = level.water
	state.walkable = level.walkable
	state.add_player(PLAYER_ID, level.spawn)
	var ground := GroundView.new()
	add_child(ground)
	ground.setup(level)
	for b in level.buildings:
		var v := BuildingView.new()
		add_child(v)
		v.setup(b)
		building_views.append(v)
	player_view = PlayerView.new()
	add_child(player_view)
	overlay = Node2D.new()
	overlay.z_index = 4000
	overlay.draw.connect(_draw_overlay)
	add_child(overlay)
	camera = Camera2D.new()
	camera.zoom = Vector2(ZOOM_DEFAULT, ZOOM_DEFAULT) # at 1.4 a 4.5 m car is ~225 px long on the screen (matches the owner's reference)
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


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		var z := camera.zoom.x
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			z = minf(z * 1.1, ZOOM_MAX)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			z = maxf(z / 1.1, ZOOM_MIN)
		camera.zoom = Vector2(z, z)


func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode == KEY_F5:
			SaveGame.save(state)
		elif event.physical_keycode == KEY_F9:
			SaveGame.load_into(state)


func _process(_dt: float) -> void:
	var p: Dictionary = state.players[PLAYER_ID]
	var ps := Iso.to_screen(p.pos)
	camera.position = ps + Vector2(0, -1.0 * Iso.PX_PER_M_HEIGHT)
	aim_point = Iso.to_world(get_global_mouse_position() + Vector2(0, 0))
	player_view.position = ps
	player_view.dir = p.dir
	player_view.queue_redraw()
	# fade buildings that stand in front of the player and cover them on the screen
	var chest := ps + Vector2(0, -CHEST_M * Iso.PX_PER_M_HEIGHT)
	var pkey: float = p.pos.x + p.pos.y
	var z_front := -100000 # highest z of a building the player stands in front of
	var z_back := 100000   # lowest z of a building the player stands behind
	for v in building_views:
		var in_front := _in_front_of(v.b, p.pos, pkey)
		if in_front:
			z_front = maxi(z_front, v.z_index)
		elif v.b.box.has_point(chest):
			z_back = mini(z_back, v.z_index)
		v.set_faded(not in_front and v.b.box.has_point(chest))
	player_view.z_index = clampi(z_front + 1 if z_front + 1 < z_back else z_back - 1, -3999, 3999) # buildings use even z, so +1 / -1 is a free slot
	hud.text = "HP %d   Ammo %d/%d%s   [WASD] move  [LMB] fire  [R] reload  [F5] save  [F9] load  [wheel] zoom" % [
		p.hp, p.ammo, GameState.MAG_SIZE, "  reloading..." if p.reload > 0.0 else ""]
	overlay.queue_redraw()


## True when the player stands nearer the camera than the building (point vs convex footprint).
func _in_front_of(b: Dictionary, pos: Vector2, pkey: float) -> bool:
	var poly: PackedVector2Array = b.poly
	var c: Vector2 = b.center
	var best := -INF
	var best_front: bool = pkey >= b.key
	for i in poly.size():
		var p0 := poly[i]
		var p1 := poly[(i + 1) % poly.size()]
		var e := (p1 - p0).normalized()
		var n := Vector2(e.y, -e.x)
		if n.dot(c - p0) > 0.0:
			n = -n
		var dist := n.dot(pos - p0)
		if dist > best:
			best = dist
			best_front = (n.x + n.y) > 0.0
	return best_front


func _read_move() -> Vector2:
	var v := Vector2.ZERO
	# Controls are remapped so that W moves up on the screen (world axes are rotated 45 degrees).
	if Input.is_physical_key_pressed(KEY_W): v += Vector2(-1, -1)
	if Input.is_physical_key_pressed(KEY_S): v += Vector2(1, 1)
	if Input.is_physical_key_pressed(KEY_A): v += Vector2(-1, 1)
	if Input.is_physical_key_pressed(KEY_D): v += Vector2(1, -1)
	return v.normalized() if v != Vector2.ZERO else v


func _draw_overlay() -> void:
	var p: Dictionary = state.players[PLAYER_ID]
	for t in tracers:
		var up := Vector2(0, -CHEST_M * Iso.PX_PER_M_HEIGHT)
		overlay.draw_line(Iso.to_screen(t.from) + up, Iso.to_screen(t.to) + up, Color(1, 1, 1, 0.9), 2.0)
	# Crosshair: a straight line and a cross of one colour, no range indication.
	var dist := minf((aim_point - p.pos).length(), state.ray_cast(p.pos, p.dir, GameState.MAX_RANGE))
	var end: Vector2 = p.pos + p.dir * dist
	var from_s := Iso.to_screen(p.pos)
	var end_s := Iso.to_screen(end)
	overlay.draw_line(from_s, end_s, Color(1, 1, 1, 0.6), 1.0)
	overlay.draw_line(end_s + Vector2(-8, 0), end_s + Vector2(8, 0), Color.WHITE, 2.0)
	overlay.draw_line(end_s + Vector2(0, -8), end_s + Vector2(0, 8), Color.WHITE, 2.0)
