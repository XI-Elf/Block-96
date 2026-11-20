class_name GameState
extends RefCounted
## Block-96 simulation. Knows nothing about nodes, rendering or input: it accepts commands only.
## Command: {"pid": int, "move": Vector2, "aim": Vector2 (point in metres), "fire": bool, "reload": bool}
## This lets a host player later accept the same commands from other players.

const PLAYER_RADIUS := 0.4
const PLAYER_SPEED := 4.0 # m/s
const FIRE_INTERVAL := 0.15
const MAG_SIZE := 12
const RELOAD_TIME := 1.2
const MAX_RANGE := 40.0

var tick := 0
var time := 0.0
var rng := RandomNumberGenerator.new()
var walls: Array[PackedVector2Array] = [] # convex footprints in metres, not saved (taken from the level)
var wall_boxes: Array[Rect2] = [] # broad-phase boxes for walls
var water: Array[PackedVector2Array] = [] # impassable water
var walkable: Array[PackedVector2Array] = [] # bridges over water
var players: Dictionary = {} # pid -> Dictionary
var events: Array = []


func _init(seed_value: int = 1) -> void:
	rng.seed = seed_value


func add_player(pid: int, pos: Vector2) -> void:
	players[pid] = {
		"pos": pos, "dir": Vector2.RIGHT, "hp": 100,
		"ammo": MAG_SIZE, "cooldown": 0.0, "reload": 0.0,
	}


func step(commands: Array, dt: float) -> Array:
	events = []
	for pid in players:
		var p: Dictionary = players[pid]
		p.cooldown = maxf(0.0, p.cooldown - dt)
		if p.reload > 0.0:
			p.reload = maxf(0.0, p.reload - dt)
			if p.reload == 0.0:
				p.ammo = MAG_SIZE
				events.append({"type": "reloaded", "pid": pid})
	for cmd in commands:
		_apply(cmd, dt)
	tick += 1
	time += dt
	return events


func _apply(cmd: Dictionary, dt: float) -> void:
	var pid: int = cmd.get("pid", -1)
	if not players.has(pid):
		return
	var p: Dictionary = players[pid]
	var move: Vector2 = cmd.get("move", Vector2.ZERO)
	if move.length() > 1.0:
		move = move.normalized()
	_move(p, move * PLAYER_SPEED * dt)
	var aim: Vector2 = cmd.get("aim", p.pos + p.dir)
	var to_aim: Vector2 = aim - p.pos
	if to_aim.length_squared() > 0.0001:
		p.dir = to_aim.normalized()
	if cmd.get("reload", false) and p.reload == 0.0 and p.ammo < MAG_SIZE:
		p.reload = RELOAD_TIME
	if cmd.get("fire", false) and p.cooldown == 0.0 and p.reload == 0.0:
		if p.ammo > 0:
			p.ammo -= 1
			p.cooldown = FIRE_INTERVAL
			var d := ray_cast(p.pos, p.dir, MAX_RANGE)
			events.append({"type": "shot", "pid": pid, "from": p.pos,
				"to": p.pos + p.dir * d, "hit_wall": d < MAX_RANGE})
		else:
			p.reload = RELOAD_TIME


func _move(p: Dictionary, delta: Vector2) -> void:
	var pos: Vector2 = p.pos
	pos.x += delta.x
	if hits_wall(pos):
		pos.x -= delta.x
	pos.y += delta.y
	if hits_wall(pos):
		pos.y -= delta.y
	p.pos = pos


func in_water(pos: Vector2) -> bool:
	for w in water:
		if Geometry2D.is_point_in_polygon(pos, w):
			for b in walkable:
				if Geometry2D.is_point_in_polygon(pos, b):
					return false
			return true
	return false


func set_walls(polys: Array) -> void:
	walls = []
	wall_boxes = []
	for p in polys:
		walls.append(p)
		var lo := Vector2(INF, INF)
		var hi := Vector2(-INF, -INF)
		for v in p:
			lo = lo.min(v)
			hi = hi.max(v)
		wall_boxes.append(Rect2(lo, hi - lo))


static func rect_poly(r: Rect2) -> PackedVector2Array:
	return PackedVector2Array([r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)])


func hits_wall(pos: Vector2) -> bool:
	if in_water(pos):
		return true
	var r2 := PLAYER_RADIUS * PLAYER_RADIUS
	for i in walls.size():
		if not wall_boxes[i].grow(PLAYER_RADIUS).has_point(pos):
			continue
		var poly := walls[i]
		if Geometry2D.is_point_in_polygon(pos, poly):
			return true
		for k in poly.size():
			var q: Vector2 = Geometry2D.get_closest_point_to_segment(pos, poly[k], poly[(k + 1) % poly.size()])
			if pos.distance_squared_to(q) < r2:
				return true
	return false


## Distance to the first wall along the ray (or max_dist).
func ray_cast(origin: Vector2, dir: Vector2, max_dist: float) -> float:
	var best := max_dist
	var end := origin + dir * max_dist
	var ray_box := Rect2(origin, Vector2.ZERO).expand(end)
	for i in walls.size():
		if not wall_boxes[i].intersects(ray_box):
			continue
		var poly := walls[i]
		for k in poly.size():
			var hit = Geometry2D.segment_intersects_segment(origin, end, poly[k], poly[(k + 1) % poly.size()])
			if hit != null:
				best = minf(best, origin.distance_to(hit))
	return best


func to_dict() -> Dictionary:
	var out_players := {}
	for pid in players:
		var p: Dictionary = players[pid]
		out_players[str(pid)] = {
			"pos": [p.pos.x, p.pos.y], "dir": [p.dir.x, p.dir.y], "hp": p.hp,
			"ammo": p.ammo, "cooldown": p.cooldown, "reload": p.reload,
		}
	return {"version": 1, "tick": tick, "time": time,
		"rng_seed": str(rng.seed), "rng_state": str(rng.state), "players": out_players}


func load_dict(d: Dictionary) -> void:
	tick = int(d.get("tick", 0))
	time = float(d.get("time", 0.0))
	rng.seed = int(d.get("rng_seed", "1"))
	rng.state = int(d.get("rng_state", "0"))
	players = {}
	for key in d.get("players", {}):
		var p: Dictionary = d.players[key]
		players[int(key)] = {
			"pos": Vector2(p.pos[0], p.pos[1]), "dir": Vector2(p.dir[0], p.dir[1]),
			"hp": int(p.hp), "ammo": int(p.ammo),
			"cooldown": float(p.cooldown), "reload": float(p.reload),
		}
