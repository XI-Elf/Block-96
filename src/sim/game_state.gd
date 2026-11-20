class_name GameState
extends RefCounted
## Симуляция Block-96. Не знает про узлы, отрисовку и ввод: принимает только команды.
## Команда: {"pid": int, "move": Vector2, "aim": Vector2 (точка в метрах), "fire": bool, "reload": bool}
## Это нужно, чтобы позже хост-игрок мог принимать такие же команды от других игроков.

const PLAYER_RADIUS := 0.4
const PLAYER_SPEED := 4.0 # м/с
const FIRE_INTERVAL := 0.15
const MAG_SIZE := 12
const RELOAD_TIME := 1.2
const MAX_RANGE := 40.0

var tick := 0
var time := 0.0
var rng := RandomNumberGenerator.new()
var walls: Array[Rect2] = [] # метры, не сохраняются (берутся из уровня)
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


func hits_wall(pos: Vector2) -> bool:
	for r in walls:
		var nearest := Vector2(clampf(pos.x, r.position.x, r.end.x), clampf(pos.y, r.position.y, r.end.y))
		if pos.distance_squared_to(nearest) < PLAYER_RADIUS * PLAYER_RADIUS:
			return true
	return false


## Расстояние до первой стены вдоль луча (или max_dist).
func ray_cast(origin: Vector2, dir: Vector2, max_dist: float) -> float:
	var best := max_dist
	for r in walls:
		var t := _ray_rect(origin, dir, r)
		if t >= 0.0 and t < best:
			best = t
	return best


static func _ray_rect(o: Vector2, d: Vector2, r: Rect2) -> float:
	var tmin := -INF
	var tmax := INF
	for axis in 2:
		var oa: float = o[axis]
		var da: float = d[axis]
		var lo: float = r.position[axis]
		var hi: float = r.end[axis]
		if absf(da) < 0.000001:
			if oa < lo or oa > hi:
				return -1.0
		else:
			var t1 := (lo - oa) / da
			var t2 := (hi - oa) / da
			tmin = maxf(tmin, minf(t1, t2))
			tmax = minf(tmax, maxf(t1, t2))
	if tmax < tmin or tmax < 0.0:
		return -1.0
	return maxf(tmin, 0.0)


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
