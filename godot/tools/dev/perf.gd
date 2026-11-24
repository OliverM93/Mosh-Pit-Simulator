extends SceneTree
## CPU cost of the slice without rendering (game logic, AnimationTrees, IK, physics):
##   godot --headless --path godot --fixed-fps 60 -s res://tools/dev/perf.gd -- [npcs] [watchers]
## Rendering cost must be measured on real hardware (debug HUD shows FPS, draw calls, triangles).

var main: Node
var frame := 0
var last := 0
var times: Array[float] = []


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	main = (load("res://scenes/main.tscn") as PackedScene).instantiate()
	if args.size() > 0:
		main.npc_count = int(args[0])
	if args.size() > 1:
		main.watcher_count = int(args[1])
	root.add_child(main)


func _process(_delta: float) -> bool:
	var now := Time.get_ticks_usec()
	frame += 1
	if frame > 60:
		times.append((now - last) / 1000.0)
	last = now
	if frame < 660:
		return false
	times.sort()
	var sum := 0.0
	for t in times:
		sum += t
	print("npcs %d watchers %d: CPU frame %.2f ms avg, %.2f ms p95, %.2f ms max" % [
		main.npc_count, main.watcher_count, sum / times.size(), times[int(times.size() * 0.95)], times[-1]])
	return true
