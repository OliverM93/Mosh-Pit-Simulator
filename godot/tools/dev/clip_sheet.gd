extends SceneTree
## Animation review sheet: one image per clip, the player character posed at evenly spaced clip times side by side
## (front view above, side view below). Uses the real AnimationLibrary (ClipLibrary), so what you see is what plays.
##   godot --path godot --resolution 1600x700 -s res://tools/dev/clip_sheet.gd -- <out_dir> [clip,clip,...] [poses]

var out := ""
var clips: Array = []
var poses := 8
var idx := -1
var stage: Node3D
var wait := 0


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	out = args[0]
	DirAccess.make_dir_recursive_absolute(out)
	var lib := ClipLibrary.shared()
	clips = args[1].split(",") if args.size() > 1 and args[1] != "" else Array(lib.library.get_animation_list())
	if args.size() > 2:
		poses = int(args[2])


func _build(clip: StringName) -> void:
	if stage:
		stage.free()
	stage = Node3D.new()
	root.add_child(stage)
	var lib := ClipLibrary.shared()
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.background_mode = Environment.BG_COLOR
	env.environment.background_color = Color(0.16, 0.16, 0.18)
	env.environment.ambient_light_color = Color(0.6, 0.6, 0.65)
	env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	stage.add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-40, 30, 0)
	sun.light_energy = 1.4
	stage.add_child(sun)
	var len := lib.length(clip)
	for row in 2:
		for i in poses:
			var model: Node3D = (load(Mosher.VARIANT_PATH % "player") as PackedScene).instantiate()
			stage.add_child(model)
			var rm := Node3D.new()
			rm.name = ClipLibrary.ROOT_MOTION_NODE
			model.add_child(rm)
			var ap := AnimationPlayer.new()
			ap.add_animation_library(&"", lib.library)
			model.add_child(ap)
			ap.play(clip)
			ap.seek(len * i / maxf(1, poses - 1) * 0.999, true)
			ap.pause()
			model.position = Vector3((i - (poses - 1) * 0.5) * 1.6, 0, 0)
			model.rotation.y = 0.0 if row == 0 else PI * 0.5
			if row == 1:
				model.position.y = -2.4
	var cam := Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = 5.2
	cam.position = Vector3(0, -0.2, 10)
	stage.add_child(cam)
	cam.current = true
	var label := Label3D.new()
	label.text = "%s  %.2fs  (%d poses)" % [clip, len, poses]
	label.font_size = 48
	label.pixel_size = 0.004
	label.position = Vector3(-poses * 0.8 + 1.5, 2.25, 0)
	stage.add_child(label)


func _process(_delta: float) -> bool:
	if wait > 0:
		wait -= 1
		if wait == 0:
			root.get_texture().get_image().save_png("%s/%s.png" % [out, clips[idx]])
		return false
	idx += 1
	if idx >= clips.size():
		return true
	_build(StringName(clips[idx]))
	wait = 3
	return false
