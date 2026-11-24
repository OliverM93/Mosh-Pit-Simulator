class_name Watcher
extends Node3D
## A person in the pit wall (tier B, docs/GODOT_MIGRATION.md 7.6): full character, cheap animation (AnimationPlayer
## loops with an individual tempo and phase), a static capsule the moshers bump into, and a short shove-back reaction.

const RADIUS := 0.3

var player: AnimationPlayer
var library: ClipLibrary
var rng := RandomNumberGenerator.new()
var energy := 0.5
var _next_change := 0.0
var _busy := 0.0


func setup(variant_id: String, lib: ClipLibrary, seed_value: int) -> void:
	library = lib
	rng.seed = seed_value
	energy = rng.randf()
	var model: Node3D = (load(Mosher.VARIANT_PATH % variant_id) as PackedScene).instantiate()
	add_child(model)
	var rm := Node3D.new()
	rm.name = ClipLibrary.ROOT_MOTION_NODE  # one-shot clips carry a root motion track; watchers stay in place
	model.add_child(rm)
	player = AnimationPlayer.new()
	player.add_animation_library(&"", lib.library)
	model.add_child(player)
	player.root_node = NodePath("..")
	var body := StaticBody3D.new()
	body.collision_layer = 4
	body.collision_mask = 0
	body.set_meta(&"watcher", self)
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = RADIUS
	capsule.height = 1.75
	shape.shape = capsule
	shape.position.y = 0.875
	body.add_child(shape)
	add_child(body)
	_loop()


func _process(delta: float) -> void:
	_next_change -= delta
	_busy -= delta
	if _next_change <= 0.0 and _busy <= 0.0:
		if rng.randf() < 0.25 + energy * 0.3:
			_once(&"cheer")
		else:
			_loop()


## Someone crashed into the wall: shove them back towards the pit.
func shove_back() -> void:
	if _busy > 0.0:
		return
	_once(&"shove" if rng.randf() < 0.5 else &"shove_m", 0.25)


func _loop() -> void:
	var clip := &"pogo" if energy > 0.85 and rng.randf() < 0.5 else &"idle"
	player.play(clip, 0.4, rng.randf_range(0.85, 1.15))
	player.seek(rng.randf() * library.length(clip), true)
	_next_change = rng.randf_range(4.0, 9.0)


func _once(clip: StringName, blend := 0.3) -> void:
	player.play(clip, blend)
	_busy = library.length(clip)
	_next_change = _busy
