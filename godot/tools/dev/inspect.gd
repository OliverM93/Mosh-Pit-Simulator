extends SceneTree
# Prints the node tree of an imported scene and its animations: godot --headless -s tools/dev/inspect.gd -- res://path.glb
func _init():
	var path = OS.get_cmdline_user_args()[0]
	var root = load(path).instantiate()
	_dump(root, 0)
	var ap = root.find_children("*", "AnimationPlayer", true, false)
	if ap.size() > 0:
		var p: AnimationPlayer = ap[0]
		for n in p.get_animation_list():
			var a = p.get_animation(n)
			var tr = []
			for i in min(a.get_track_count(), 4):
				tr.append("%s(%d)" % [a.track_get_path(i), a.track_get_type(i)])
			print("anim %s len=%.3f tracks=%d %s" % [n, a.length, a.get_track_count(), tr])
			break
		print("anims: ", p.get_animation_list().size())
	quit()
func _dump(n, d):
	var extra = ""
	if n is Skeleton3D:
		extra = " bones=%d first=%s" % [n.get_bone_count(), n.get_bone_name(0)]
	if n is MeshInstance3D:
		extra = " surfaces=%d" % n.mesh.get_surface_count()
	print("  ".repeat(d), n.name, " (", n.get_class(), ")", extra)
	for c in n.get_children():
		_dump(c, d + 1)
