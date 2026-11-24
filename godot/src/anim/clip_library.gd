class_name ClipLibrary
extends RefCounted
## Turns the baked mocap (assets/animations/anims.glb + anims_meta.json, built by tools/anim/build_anims.py) into one
## shared AnimationLibrary for every mosher (D-033):
## - only bone rotations and the hip height are animated (variants with other proportions share the clips),
## - horizontal hip travel of one-shot clips moves to a separate "RootMotion" track (extracted as root motion by the
##   AnimationTree, so the capsule follows the body instead of the body leaving the capsule),
## - loops are flagged, clip phases (foot contacts, airborne) come from the meta data measured on the motion itself.

const ANIMS := "res://assets/animations/anims.glb"
const META := "res://assets/animations/anims_meta.json"
const SKELETON_PATH := "Rig/Skeleton3D"
const ROOT_BONE := "root"
## Node path (relative to the model) of the dummy node that carries root motion.
const ROOT_MOTION_NODE := "RootMotion"

static var _shared: ClipLibrary

var library := AnimationLibrary.new()
var info := {}  ## clip name -> ClipInfo


## Phase data of one clip (seconds, clip time).
class ClipInfo:
	var name: StringName
	var length := 0.0
	var loop := false
	## Travel speed (m/s) of a loop as captured (0 for in-place dances).
	var speed := 0.0
	## Airborne intervals [[t0, t1], …].
	var air: Array = []
	## Ground contact intervals per foot: {"L": [[t0, t1], …], "R": […]}.
	var contacts: Dictionary = {}
	## Total horizontal root travel (model space) of one-shots.
	var travel := Vector3.ZERO
	## Strike moment (farthest hand reach) of aimed clips, -1 if none. Aimed clips are turned so it points forward.
	var hit_time := -1.0

	func air_start() -> float:
		return air[0][0] if air.size() > 0 else -1.0

	func air_end() -> float:
		return air[air.size() - 1][1] if air.size() > 0 else -1.0

	func foot_down(foot: String, t: float) -> bool:
		for iv in contacts.get(foot, []):
			if t >= iv[0] and t <= iv[1]:
				return true
		return false


static func shared() -> ClipLibrary:
	if _shared == null:
		_shared = ClipLibrary.new()
		_shared._build()
	return _shared


func has(clip: StringName) -> bool:
	return info.has(clip)


func get_info(clip: StringName) -> ClipInfo:
	return info.get(clip)


func length(clip: StringName) -> float:
	var ci: ClipInfo = info.get(clip)
	return ci.length if ci else 0.0


## Clip name of the mirrored variant if it exists.
func resolve(clip: StringName, mirror: bool) -> StringName:
	var m := StringName(str(clip) + "_m")
	return m if mirror and info.has(m) else clip


func _build() -> void:
	var meta: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(META)).get("clips", {})
	var scene: Node = (load(ANIMS) as PackedScene).instantiate()
	var player: AnimationPlayer = scene.get_node("AnimationPlayer")
	for clip_name in player.get_animation_list():
		var src: Animation = player.get_animation(clip_name)
		var m: Dictionary = meta.get(str(clip_name), {})
		var ci := ClipInfo.new()
		ci.name = clip_name
		ci.loop = m.get("loop", false)
		ci.speed = m.get("speed", 0.0)
		ci.air = m.get("air", [])
		ci.contacts = m.get("contacts", {})
		var aim: Dictionary = m.get("aim", {})
		ci.hit_time = aim.get("time", -1.0)
		var anim := _convert(src, ci, aim.get("yaw", 0.0))
		ci.length = anim.length
		for i in ci.air.size():
			anim.add_marker("air_start" if i == 0 else "air_start_%d" % i, ci.air[i][0])
			anim.add_marker("air_end" if i == 0 else "air_end_%d" % i, ci.air[i][1])
		library.add_animation(clip_name, anim)
		info[clip_name] = ci
	scene.free()


## `aim_yaw`: rotate the whole clip so its strike points along model forward (+Z).
func _convert(src: Animation, ci: ClipInfo, aim_yaw := 0.0) -> Animation:
	var a := Animation.new()
	a.length = src.length
	a.step = src.step
	a.loop_mode = Animation.LOOP_LINEAR if ci.loop else Animation.LOOP_NONE
	var root_path := NodePath(SKELETON_PATH + ":" + ROOT_BONE)
	for i in src.get_track_count():
		var type := src.track_get_type(i)
		var path := src.track_get_path(i)
		if type == Animation.TYPE_ROTATION_3D:
			var t := _copy_track(src, i, a)
			if path == root_path and absf(aim_yaw) > 0.01:
				var turn := Quaternion(Vector3.UP, -aim_yaw)
				for k in a.track_get_key_count(t):
					a.track_set_key_value(t, k, turn * (a.track_get_key_value(t, k) as Quaternion))
		elif type == Animation.TYPE_POSITION_3D and path == root_path:
			_split_root(src, i, a, ci, -aim_yaw)
	return a


func _copy_track(src: Animation, i: int, dst: Animation) -> int:
	var t := dst.add_track(src.track_get_type(i))
	dst.track_set_path(t, src.track_get_path(i))
	dst.track_set_interpolation_type(t, Animation.INTERPOLATION_LINEAR)
	dst.track_set_interpolation_loop_wrap(t, true)
	for k in src.track_get_key_count(i):
		dst.track_insert_key(t, src.track_get_key_time(i, k), src.track_get_key_value(i, k))
	return t


## Hip height stays on the bone; horizontal travel goes to the RootMotion track (one-shots) or is dropped (loops are
## captured in place; the game drives their speed).
func _split_root(src: Animation, i: int, dst: Animation, ci: ClipInfo, turn := 0.0) -> void:
	var hips := dst.add_track(Animation.TYPE_POSITION_3D)
	dst.track_set_path(hips, src.track_get_path(i))
	var motion := -1
	if not ci.loop:
		motion = dst.add_track(Animation.TYPE_POSITION_3D)
		dst.track_set_path(motion, NodePath(ROOT_MOTION_NODE))
	var first: Vector3 = src.track_get_key_value(i, 0)
	var last := first
	for k in src.track_get_key_count(i):
		var t := src.track_get_key_time(i, k)
		var p: Vector3 = src.track_get_key_value(i, k)
		dst.track_insert_key(hips, t, Vector3(first.x, p.y, first.z))
		if motion >= 0:
			dst.track_insert_key(motion, t, Vector3(p.x - first.x, 0.0, p.z - first.z).rotated(Vector3.UP, turn))
		last = p
	ci.travel = Vector3(last.x - first.x, 0.0, last.z - first.z).rotated(Vector3.UP, turn)
