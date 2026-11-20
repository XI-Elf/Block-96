class_name Level
extends RefCounted
## Загрузка уровня из JSON: стены (метры) и точка появления.

var size := Vector2(100, 100)
var spawn := Vector2(10, 10)
var walls: Array[Rect2] = []
var name := ""


static func load_from(path: String) -> Level:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_error("Не открыть уровень: " + path)
		return null
	var data = JSON.parse_string(f.get_as_text())
	if typeof(data) != TYPE_DICTIONARY:
		push_error("Битый JSON уровня: " + path)
		return null
	var lv := Level.new()
	lv.name = data.get("name", "")
	lv.size = Vector2(data.size[0], data.size[1])
	lv.spawn = Vector2(data.spawn[0], data.spawn[1])
	for w in data.walls:
		lv.walls.append(Rect2(w[0], w[1], w[2], w[3]))
	return lv
