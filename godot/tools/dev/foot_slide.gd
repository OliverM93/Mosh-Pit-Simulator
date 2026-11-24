extends SceneTree
## Measures foot sliding of the player character (acceptance criterion: < 3 cm per ground contact): drives the body
## straight at fixed stick values in an empty room, samples both ankles in world space every physics tick and sums the
## horizontal travel of each foot while it is planted (low and nearly still).
##   godot --headless --path godot --fixed-fps 60 -s res://tools/dev/foot_slide.gd

var body: Mosher
var sk: Skeleton3D
var frame := 0
var phases := [["walk 0.4", 0.4, false], ["jog 0.8", 0.8, false], ["full stick", 1.0, false], ["sprint", 1.0, true]]
var phase := 0
var samples := {"L": [], "R": []}
var results := []


func _initialize() -> void:
	var floor := StaticBody3D.new()
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(400, 1, 400)
	shape.shape = box
	shape.position.y = -0.5
	floor.add_child(shape)
	root.add_child(floor)
	body = Mosher.new()
	root.add_child(body)
	body.setup("player", ClipLibrary.shared(), 90.0)
	sk = body.model.get_node("Rig/Skeleton3D")
	# Read the final pose (after FootLock and other modifiers) when the skeleton has been updated.
	sk.skeleton_updated.connect(_on_skeleton_updated)
	if OS.get_cmdline_user_args().has("--no-lock"):
		body.use_foot_lock = false


var final_pose := {"L": Vector3.ZERO, "R": Vector3.ZERO}


func _on_skeleton_updated() -> void:
	for s in ["L", "R"]:
		final_pose[s] = (sk.global_transform * sk.get_bone_global_pose(sk.find_bone("foot.%s" % s))).origin


func _physics_process(_delta: float) -> bool:
	frame += 1
	var p = phases[phase]
	body.move_input = Vector2(0, -p[1])
	body.sprint = p[2]
	if frame > 90:  # settled at speed
		if body.use_foot_lock:
			samples["L"].append(body.foot_lock.final_world[0])
			samples["R"].append(body.foot_lock.final_world[1])
		else:
			for s in ["L", "R"]:
				samples[s].append((sk.global_transform * sk.get_bone_global_pose(sk.find_bone("foot.%s" % s))).origin)
	if frame >= 300:
		var v := Vector2(body.velocity.x, body.velocity.z).length()
		results.append([p[0], v, _slide("L", v), _slide("R", v)])
		samples = {"L": [], "R": []}
		frame = 0
		phase += 1
		if phase >= phases.size():
			for r in results:
				print("%-11s speed %.2f m/s   slide per contact  L %.1f cm  R %.1f cm" % [r[0], r[1], r[2] * 100, r[3] * 100])
			return true
	return false


## Mean horizontal travel per contact: a contact = consecutive samples where the ankle is within 2.5 cm of its
## lowest height and moves slower than 35 % of the body (a swinging foot moves at ≥ 2× body speed).
func _slide(s: String, body_speed: float) -> float:
	var pts: Array = samples[s]
	var low := INF
	for q in pts:
		low = minf(low, q.y)
	var total := 0.0
	var contacts := 0
	var inside := false
	for i in range(1, pts.size()):
		var d := Vector2(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z).length()
		var planted: bool = pts[i].y < low + 0.025 and d < body_speed / 60.0 * 0.35
		if planted:
			total += d
			if not inside:
				contacts += 1
		inside = planted
	return total / maxf(1, contacts)
