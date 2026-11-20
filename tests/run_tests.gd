extends SceneTree
## Run: godot --headless -s tests/run_tests.gd

var failed := 0


func check(cond: bool, msg: String) -> void:
	if cond:
		print("ok   ", msg)
	else:
		failed += 1
		print("FAIL ", msg)


func cmd(move := Vector2.ZERO, aim := Vector2(1000, 0), fire := false, reload := false) -> Dictionary:
	return {"pid": 1, "move": move, "aim": aim, "fire": fire, "reload": reload}


func _init() -> void:
	var lv := Level.load_from("res://data/levels/pavlov_yar.json")
	check(lv != null and lv.walls.size() > 0, "level loads")
	var st := GameState.new(7)
	st.set_walls(lv.walls)
	st.water = lv.water
	st.walkable = lv.walkable
	st.add_player(1, lv.spawn)
	check(not st.hits_wall(lv.spawn), "spawn is not inside a wall")

	# water and bridges
	check(lv.water.size() > 0 and lv.bridges.size() == 2 and lv.blockposts.size() == 2, "river, 2 bridges, 2 checkpoints")
	check(st.in_water(Vector2(380, 175)) and not st.hits_wall(lv.bridges[0].pts[0].lerp(lv.bridges[0].pts[1], 0.5)) , "water is impassable, bridge is walkable")

	# scale and building variety
	check(absf(Iso.PX_PER_M_HEIGHT - 45.2548 * cos(deg_to_rad(30.0))) < 0.1, "vertical scale matches the isometric projection")
	var min_h := 1e9
	var max_h := 0.0
	var rotated := 0
	for bd in lv.buildings:
		if bd.kind == "house" or bd.kind == "panel":
			min_h = minf(min_h, bd.h)
			max_h = maxf(max_h, bd.h)
		if absf(bd.angle) > 2.0:
			rotated += 1
	check(min_h <= 3.3 and max_h >= 9 * 2.8 - 0.1 and max_h <= 9 * 2.8 + 0.1, "heights range from 1 floor to 9 floors (max 9)")
	check(rotated > 10, "buildings follow non-orthogonal streets")
	var oriented := lv.buildings.filter(func(bd): return bd.kind == "house" and absf(bd.angle) > 10.0)
	if oriented.size() > 0:
		check(st.hits_wall(oriented[0].center), "rotated building blocks movement")

	# movement and collisions
	var p0: Vector2 = st.players[1].pos
	for i in 30:
		st.step([cmd(Vector2(0, 1))], 1.0 / 60.0)
	check(st.players[1].pos.y > p0.y, "player moves")
	var st2 := GameState.new(7)
	st2.set_walls([GameState.rect_poly(Rect2(5, 0, 1, 10))])
	st2.add_player(1, Vector2(3, 5))
	for i in 600:
		st2.step([cmd(Vector2(1, 0))], 1.0 / 60.0)
	check(st2.players[1].pos.x < 5.0, "wall blocks movement")

	# ray and shot
	check(is_equal_approx(st2.ray_cast(Vector2(3, 5), Vector2.RIGHT, 40.0), 2.0), "ray to wall = 2 m")
	check(is_equal_approx(st2.ray_cast(Vector2(3, 5), Vector2.LEFT, 40.0), 40.0), "ray into empty space = max")
	var st3 := GameState.new(1)
	st3.set_walls([GameState.rect_poly(Rect2(10, 0, 1, 10))])
	st3.add_player(1, Vector2(2, 5))
	var ev := st3.step([cmd(Vector2.ZERO, Vector2(20, 5), true)], 1.0 / 60.0)
	check(ev.size() == 1 and ev[0].type == "shot" and ev[0].hit_wall, "shot hits the wall")
	check(st3.players[1].ammo == GameState.MAG_SIZE - 1, "round is spent")
	ev = st3.step([cmd(Vector2.ZERO, Vector2(20, 5), true)], 1.0 / 60.0)
	check(ev.size() == 0, "fire rate is limited")

	# reload
	for i in 120:
		st3.step([cmd(Vector2.ZERO, Vector2(20, 5), false, true)], 1.0 / 60.0)
	check(st3.players[1].ammo == GameState.MAG_SIZE, "reload completes")

	# determinism: same commands -> same state
	var a := _run_scripted(3)
	var b := _run_scripted(3)
	check(JSON.stringify(a.to_dict()) == JSON.stringify(b.to_dict()), "simulation is deterministic")

	# save and load
	var path := "user://test_save.json"
	check(SaveGame.save(a, path), "save is written")
	var c := GameState.new(999)
	check(SaveGame.load_into(c, path), "save is readable")
	check(JSON.stringify(a.to_dict()) == JSON.stringify(c.to_dict()), "load equals the original state")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

	# isometry round trip
	var w := Vector2(13.5, 7.25)
	check(Iso.to_world(Iso.to_screen(w)).is_equal_approx(w), "iso round trip")

	print("RESULT: ", "OK" if failed == 0 else "%d failures" % failed)
	quit(1 if failed > 0 else 0)


func _run_scripted(seed_value: int) -> GameState:
	var lv := Level.load_from("res://data/levels/pavlov_yar.json")
	var s := GameState.new(seed_value)
	s.set_walls(lv.walls)
	s.water = lv.water
	s.walkable = lv.walkable
	s.add_player(1, lv.spawn)
	for i in 240:
		s.step([cmd(Vector2(sin(i * 0.05), cos(i * 0.07)), Vector2(60 + i % 7, 66), i % 5 == 0)], 1.0 / 60.0)
	return s
