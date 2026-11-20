class_name SaveGame
extends RefCounted
## Saving on the player's device (user://).

const DEFAULT_PATH := "user://save.json"


static func save(state: GameState, path: String = DEFAULT_PATH) -> bool:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(JSON.stringify(state.to_dict()))
	return true


static func load_into(state: GameState, path: String = DEFAULT_PATH) -> bool:
	if not FileAccess.file_exists(path):
		return false
	var f := FileAccess.open(path, FileAccess.READ)
	var data = JSON.parse_string(f.get_as_text())
	if typeof(data) != TYPE_DICTIONARY:
		return false
	state.load_dict(data)
	return true
