class_name MosherAnimator
extends Node
## Drives one mosher's AnimationTree (built here in code so it stays reviewable as text):
##
##   idle ──────────────┐
##   walk ─ seek ┐      ├─ loco ─┐
##   run  ─ seek ┴ walkrun┘       ├─ full ─┐
##   a ─ seek ┐                   │        ├─ upper ─ output
##   b ─ seek ┴─ ab ──────────────┘        │  (bone filter: spine + arms + head)
##   u ─ seek ─────────────────────────────┘
##
## - Locomotion is distance-matched: walk and run share one stride phase advanced by the real ground speed, with each
##   clip offset so its left foot strikes at phase 0 → feet neither slide nor mush when the two blend.
## - Moves play in their own captured tempo on two alternating full-body slots (a/b) so a move can cross-fade into the
##   next one; arm/torso moves play on the upper slot over whatever the legs do.
## - Root motion of the moves comes out of the "RootMotion" track (see ClipLibrary) and is consumed by the body.

const UPPER_BONES := [
	"spine03", "spine02", "spine01", "neck01", "neck02", "neck03", "head",
	"clavicle.L", "shoulder01.L", "upperarm01.L", "upperarm02.L", "lowerarm01.L", "lowerarm02.L", "wrist.L",
	"clavicle.R", "shoulder01.R", "upperarm01.R", "upperarm02.R", "lowerarm01.R", "lowerarm02.R", "wrist.R",
]

var tree: AnimationTree
var clips: ClipLibrary
var walk_speed := 1.2
var run_speed := 3.6

var _stride_walk := 1.3
var _stride_run := 2.6
var _offset_walk := 0.0
var _offset_run := 0.0
var _phase := 0.0
var _speed := 0.0
var _full := _Fade.new()
var _ab := _Fade.new()
var _upper := _Fade.new()
var _slot_b := false
var _root_motion := Vector3.ZERO
var _root: AnimationNodeBlendTree


class _Fade:
	var value := 0.0
	var target := 0.0
	var rate := 10.0

	func to(t: float, time: float) -> void:
		target = t
		rate = 1.0 / maxf(0.01, time)

	func step(dt: float) -> void:
		value = move_toward(value, target, rate * dt)


## `model` is the imported character (Rig/Skeleton3D inside). Adds the AnimationPlayer, RootMotion node and tree.
func setup(model: Node3D, library: ClipLibrary) -> void:
	clips = library
	var player := AnimationPlayer.new()
	player.name = "Anim"
	player.add_animation_library(&"", library.library)
	model.add_child(player)
	var rm := Node3D.new()
	rm.name = ClipLibrary.ROOT_MOTION_NODE
	model.add_child(rm)
	tree = AnimationTree.new()
	tree.name = "Tree"
	model.add_child(tree)
	tree.root_node = NodePath("..")
	tree.anim_player = NodePath("../Anim")
	tree.root_motion_track = NodePath(ClipLibrary.ROOT_MOTION_NODE)
	tree.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	tree.tree_root = _build_tree()
	tree.active = true
	_measure_locomotion()


func _build_tree() -> AnimationNodeBlendTree:
	var bt := AnimationNodeBlendTree.new()
	_root = bt
	var px := 0.0
	for n in ["idle", "walk", "run", "a", "b", "u"]:
		var a := AnimationNodeAnimation.new()
		a.animation = &"idle" if n in ["a", "b", "u"] else StringName(n)
		bt.add_node(n, a, Vector2(px, 0))
		px += 200.0
		if n != "idle":
			bt.add_node(n + "_seek", AnimationNodeTimeSeek.new())
			bt.connect_node(n + "_seek", 0, n)
	for n in ["walkrun", "loco", "ab", "full", "upper"]:
		bt.add_node(n, AnimationNodeBlend2.new())
	bt.connect_node("walkrun", 0, "walk_seek")
	bt.connect_node("walkrun", 1, "run_seek")
	bt.connect_node("loco", 0, "idle")
	bt.connect_node("loco", 1, "walkrun")
	bt.connect_node("ab", 0, "a_seek")
	bt.connect_node("ab", 1, "b_seek")
	bt.connect_node("full", 0, "loco")
	bt.connect_node("full", 1, "ab")
	bt.connect_node("upper", 0, "full")
	bt.connect_node("upper", 1, "u_seek")
	var upper: AnimationNodeBlend2 = bt.get_node("upper")
	upper.filter_enabled = true
	for b in UPPER_BONES:
		upper.set_filter_path(NodePath(ClipLibrary.SKELETON_PATH + ":" + b), true)
	bt.connect_node("output", 0, "upper")
	return bt


func _measure_locomotion() -> void:
	var w := clips.get_info(&"walk")
	var r := clips.get_info(&"run")
	if w:
		walk_speed = maxf(0.5, w.speed)
		_stride_walk = walk_speed * w.length
		_offset_walk = _strike(w) / w.length
	if r:
		run_speed = maxf(walk_speed + 0.5, r.speed)
		_stride_run = run_speed * r.length
		_offset_run = _strike(r) / r.length


## Start of the left foot's main ground contact (where the cycle is aligned).
func _strike(ci: ClipLibrary.ClipInfo) -> float:
	var best := [0.0, 0.0]
	for iv in ci.contacts.get("L", []):
		if iv[1] - iv[0] > best[1] - best[0]:
			best = iv
	return best[0]


## Ground speed the locomotion shows (m/s).
func set_speed(speed: float) -> void:
	_speed = maxf(0.0, speed)


## Full-body move: cross-fades from locomotion or the previous move into `clip` starting at `offset`.
func play_full(clip: StringName, offset := 0.0, fade := 0.12) -> void:
	_slot_b = not _slot_b if _full.value > 0.01 else _slot_b
	var slot := "b" if _slot_b else "a"
	(_root.get_node(slot) as AnimationNodeAnimation).animation = clip
	tree.set("parameters/%s_seek/seek_request" % slot, offset)
	_ab.to(1.0 if _slot_b else 0.0, fade if _full.value > 0.01 else 0.0)
	_full.to(1.0, fade)


func release_full(fade := 0.2) -> void:
	_full.to(0.0, fade)


func play_upper(clip: StringName, offset := 0.0, fade := 0.1) -> void:
	(_root.get_node("u") as AnimationNodeAnimation).animation = clip
	tree.set("parameters/u_seek/seek_request", offset)
	_upper.to(1.0, fade)


func release_upper(fade := 0.2) -> void:
	_upper.to(0.0, fade)


func full_weight() -> float:
	return _full.value


## Root motion (model space) accumulated since the last call.
func consume_root_motion() -> Vector3:
	var r := _root_motion
	_root_motion = Vector3.ZERO
	return r


func advance(dt: float) -> void:
	if tree == null:
		return
	var t_walk := clampf((_speed - walk_speed) / (run_speed - walk_speed), 0.0, 1.0)
	var moving := clampf(_speed / walk_speed, 0.0, 1.0)
	var stride := lerpf(_stride_walk, _stride_run, t_walk)
	_phase = fposmod(_phase + dt * _speed / stride, 1.0)
	var w_len := clips.length(&"walk")
	var r_len := clips.length(&"run")
	tree.set("parameters/walk_seek/seek_request", fposmod(_phase + _offset_walk, 1.0) * w_len)
	tree.set("parameters/run_seek/seek_request", fposmod(_phase + _offset_run, 1.0) * r_len)
	tree.set("parameters/walkrun/blend_amount", smoothstep(0.0, 1.0, t_walk))
	tree.set("parameters/loco/blend_amount", smoothstep(0.0, 1.0, moving))
	_full.step(dt)
	_ab.step(dt)
	_upper.step(dt)
	tree.set("parameters/full/blend_amount", _full.value)
	tree.set("parameters/ab/blend_amount", _ab.value)
	tree.set("parameters/upper/blend_amount", _upper.value)
	tree.advance(dt)
	_root_motion += tree.get_root_motion_position()
