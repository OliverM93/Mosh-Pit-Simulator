extends SceneTree
## Scripted play-through for checks without a human: runs the main scene with simulated input and saves screenshots.
##   godot --path godot --fixed-fps 60 --resolution 1280x720 -s res://tools/dev/capture.gd -- <out_dir> [scenario]
## Scenarios: tour (default) – walk, sprint, kick, 2-step, shove, jump+kick, dodge.

var out := "user://shots"
var scenario := "tour"
var frame := 0
var main: Node
var shots := {}
var actions := []  # [frame, action, pressed]


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		out = args[0]
	if args.size() > 1:
		scenario = args[1]
	DirAccess.make_dir_recursive_absolute(out)
	main = (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	_plan()


func _plan() -> void:
	match scenario:
		"tour":
			_hold(10, 60, &"move_forward")
			_hold(60, 110, &"move_left")
			_hold(80, 110, &"sprint")
			_tap(118, &"kick")
			_hold(170, 240, &"footwork")
			_tap(250, &"interact")
			_tap(290, &"jump")
			_tap(312, &"kick")
			_tap(350, &"dodge")
			for f in [45, 100, 128, 140, 200, 225, 262, 300, 318, 362]:
				shots[f] = true
		"idle":
			for f in [60, 240, 480]:
				shots[f] = true


func _hold(a: int, b: int, action: StringName) -> void:
	actions.append([a, action, true])
	actions.append([b, action, false])


func _tap(f: int, action: StringName) -> void:
	actions.append([f, action, true])
	actions.append([f + 3, action, false])


func _process(_delta: float) -> bool:
	frame += 1
	for a in actions:
		if a[0] == frame:
			if a[2]:
				Input.action_press(a[1])
			else:
				Input.action_release(a[1])
	if shots.has(frame):
		var img := root.get_texture().get_image()
		img.save_png("%s/f%04d.png" % [out, frame])
		var p = main.get("player")
		print("shot %d  player %s  move %s  fps %d" % [frame, p.global_position, p.current_move, Engine.get_frames_per_second()])
	return frame > shots.keys().max() + 1
