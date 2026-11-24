extends SceneTree
## Smoke run of the vertical slice without a human: 15 s of scripted input on the real main scene.
## Fails (exit 1) on script errors' consequences we can see: player not moving, no moves/reactions, bodies leaving
## the room or NaN positions.  godot --headless --path godot --fixed-fps 60 -s res://tests/smoke_main.gd

var frame := 0
var main: Node
var started := {}
var reactions := 0
var player_reactions := {}
var start_pos := Vector3.ZERO
var sprint_dist := 0.0
var _prev := Vector3.ZERO
var plan := [
	[20, 80, &"move_forward"], [80, 140, &"move_left"], [100, 140, &"sprint"], [150, 153, &"kick"],
	[220, 320, &"footwork"], [330, 333, &"interact"], [380, 383, &"jump"], [405, 408, &"kick"],
	[480, 483, &"dodge"], [560, 700, &"move_right"], [700, 703, &"interact"],
]


func _initialize() -> void:
	main = (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(main)


func _process(_delta: float) -> bool:
	frame += 1
	if frame == 2:
		start_pos = main.player.global_position
		for m in root.get_tree().get_nodes_in_group(&"moshers"):
			m.move_started.connect(func(_b, mv): started[mv.def.id] = started.get(mv.def.id, 0) + 1)
			m.reacted.connect(func(b, k, _s):
				reactions += 1
				if b == main.player:
					player_reactions[k] = player_reactions.get(k, 0) + 1)
	if frame >= 100 and frame <= 140:
		if frame > 100:
			sprint_dist += Vector2(main.player.global_position.x - _prev.x, main.player.global_position.z - _prev.z).length()
		_prev = main.player.global_position
	for p in plan:
		if frame == p[0]:
			Input.action_press(p[2])
		elif frame == p[1]:
			Input.action_release(p[2])
	if frame < 900:
		return false
	var errors := []
	if main.player.global_position.distance_to(start_pos) < 1.5:
		errors.append("player barely moved")
	for id in [&"spinkick", &"two_step", &"shove", &"jump", &"dodge"]:
		if not started.has(id):
			errors.append("move never started: %s" % id)
	if reactions == 0:
		errors.append("no contact reactions in 15 s")
	for m in root.get_tree().get_nodes_in_group(&"moshers"):
		var p: Vector3 = m.global_position
		if is_nan(p.x) or is_nan(p.z) or absf(p.x) > 7.0 or absf(p.z) > 6.5 or p.y < -0.5:
			errors.append("%s out of the room at %s" % [m.name, p])
	print("moves started: ", started)
	print("player sprint through the pit: %.2f m/s" % (sprint_dist / (40.0 / 60.0)))
	print("reactions: ", reactions, "  of the player: ", player_reactions)
	if errors.is_empty():
		print("SMOKE OK")
		quit(0)
	else:
		print("SMOKE FAIL: ", "; ".join(errors))
		quit(1)
	return true
