extends SceneTree
## Запуск: godot --headless -s tests/run_tests.gd

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
	check(lv != null and lv.walls.size() > 0, "уровень загружается")
	var st := GameState.new(7)
	st.walls = lv.walls
	st.water = lv.water
	st.walkable = lv.walkable
	st.add_player(1, lv.spawn)
	check(not st.hits_wall(lv.spawn), "точка появления не в стене")

	# вода и мосты
	check(lv.water.size() > 0 and lv.bridges.size() == 2 and lv.blockposts.size() == 2, "река, 2 моста, 2 блокпоста")
	check(st.in_water(Vector2(380, 175)) and not st.hits_wall(lv.bridges[0].pts[0].lerp(lv.bridges[0].pts[1], 0.5)) , "вода непроходима, мост проходим")

	# движение и столкновения
	var p0: Vector2 = st.players[1].pos
	for i in 30:
		st.step([cmd(Vector2(0, 1))], 1.0 / 60.0)
	check(st.players[1].pos.y > p0.y, "игрок двигается")
	var st2 := GameState.new(7)
	st2.walls = [Rect2(5, 0, 1, 10)]
	st2.add_player(1, Vector2(3, 5))
	for i in 600:
		st2.step([cmd(Vector2(1, 0))], 1.0 / 60.0)
	check(st2.players[1].pos.x < 5.0, "стена не пускает")

	# луч и выстрел
	check(is_equal_approx(st2.ray_cast(Vector2(3, 5), Vector2.RIGHT, 40.0), 2.0), "луч до стены = 2 м")
	check(is_equal_approx(st2.ray_cast(Vector2(3, 5), Vector2.LEFT, 40.0), 40.0), "луч в пустоту = max")
	var st3 := GameState.new(1)
	st3.walls = [Rect2(10, 0, 1, 10)]
	st3.add_player(1, Vector2(2, 5))
	var ev := st3.step([cmd(Vector2.ZERO, Vector2(20, 5), true)], 1.0 / 60.0)
	check(ev.size() == 1 and ev[0].type == "shot" and ev[0].hit_wall, "выстрел попадает в стену")
	check(st3.players[1].ammo == GameState.MAG_SIZE - 1, "патрон потрачен")
	ev = st3.step([cmd(Vector2.ZERO, Vector2(20, 5), true)], 1.0 / 60.0)
	check(ev.size() == 0, "темп стрельбы ограничен")

	# перезарядка
	for i in 120:
		st3.step([cmd(Vector2.ZERO, Vector2(20, 5), false, true)], 1.0 / 60.0)
	check(st3.players[1].ammo == GameState.MAG_SIZE, "перезарядка завершается")

	# детерминизм: одинаковые команды -> одинаковое состояние
	var a := _run_scripted(3)
	var b := _run_scripted(3)
	check(JSON.stringify(a.to_dict()) == JSON.stringify(b.to_dict()), "детерминизм симуляции")

	# сохранение и загрузка
	var path := "user://test_save.json"
	check(SaveGame.save(a, path), "сохранение записывается")
	var c := GameState.new(999)
	check(SaveGame.load_into(c, path), "сохранение читается")
	check(JSON.stringify(a.to_dict()) == JSON.stringify(c.to_dict()), "загрузка = исходное состояние")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

	# изометрия туда-обратно
	var w := Vector2(13.5, 7.25)
	check(Iso.to_world(Iso.to_screen(w)).is_equal_approx(w), "iso туда-обратно")

	print("ИТОГ: ", "OK" if failed == 0 else "%d ошибок" % failed)
	quit(1 if failed > 0 else 0)


func _run_scripted(seed_value: int) -> GameState:
	var lv := Level.load_from("res://data/levels/pavlov_yar.json")
	var s := GameState.new(seed_value)
	s.walls = lv.walls
	s.water = lv.water
	s.walkable = lv.walkable
	s.add_player(1, lv.spawn)
	for i in 240:
		s.step([cmd(Vector2(sin(i * 0.05), cos(i * 0.07)), Vector2(60 + i % 7, 66), i % 5 == 0)], 1.0 / 60.0)
	return s
