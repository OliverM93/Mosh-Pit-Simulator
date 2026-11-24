class_name PitCamera
extends Node3D
## Third-person camera that always faces the band (D-029/D-034): it only translates with the player, so stick
## directions never change. Right stick peeks up to ±40° and springs back; the zoom button toggles near/far.
## Follows with a critically damped spring and a small look-ahead in the running direction.

const PEEK_MAX := deg_to_rad(40.0)
const NEAR := {"offset": Vector3(0.0, 2.3, 4.0), "pitch": -17.0}
const FAR := {"offset": Vector3(0.0, 3.6, 6.4), "pitch": -27.0}
const FOLLOW_RATE := 7.0
const LOOK_AHEAD := 0.35

var target: Node3D
## Room limits for the camera (x, z extents, ceiling).
var bounds := AABB(Vector3(-6.7, 0.0, -6.0), Vector3(13.4, 3.5, 12.4))
var camera: Camera3D
var far_view := false
var _peek := 0.0
var _focus := Vector3.ZERO
var _zoom := 0.0


func _ready() -> void:
	camera = Camera3D.new()
	camera.fov = 60.0
	camera.near = 0.08
	camera.far = 60.0
	add_child(camera)
	camera.current = true
	if target:
		_focus = target.global_position


func _process(delta: float) -> void:
	if target == null:
		return
	if Input.is_action_just_pressed(&"camera_zoom"):
		far_view = not far_view
	var look := Input.get_axis(&"look_left", &"look_right")
	_peek = lerpf(_peek, look * PEEK_MAX, 1.0 - exp(-(8.0 if absf(look) > 0.05 else 4.0) * delta))
	_zoom = move_toward(_zoom, 1.0 if far_view else 0.0, delta * 2.5)
	var v := Vector3.ZERO
	if target is CharacterBody3D:
		v = (target as CharacterBody3D).velocity
	var want := target.global_position + Vector3(v.x, 0.0, v.z) * LOOK_AHEAD
	_focus = _focus.lerp(want, 1.0 - exp(-FOLLOW_RATE * delta))
	var offset: Vector3 = NEAR.offset.lerp(FAR.offset, _zoom)
	var pitch := deg_to_rad(lerpf(NEAR.pitch, FAR.pitch, _zoom))
	var pos := _focus + offset.rotated(Vector3.UP, _peek)
	pos.x = clampf(pos.x, bounds.position.x, bounds.end.x)
	pos.z = clampf(pos.z, bounds.position.z, bounds.end.z)
	pos.y = minf(pos.y, bounds.end.y - 0.15)
	global_position = pos
	rotation = Vector3(pitch, _peek, 0.0)
	_fade_occluders()


## People between the camera and the player fade out (alpha) instead of blocking the view.
func _fade_occluders() -> void:
	var cam := camera.global_position
	var to := target.global_position + Vector3(0, 1.0, 0) - cam
	var len := to.length()
	for w in get_tree().get_nodes_in_group(&"watchers") + get_tree().get_nodes_in_group(&"moshers"):
		if w == target:
			continue
		var p: Vector3 = (w as Node3D).global_position + Vector3(0, 1.0, 0) - cam
		var t := clampf(p.dot(to) / (len * len), 0.0, 1.0)
		var off := (p - to * t).length()
		var hide := t < 0.85 and off < 0.75
		var alpha := 0.75 if hide else 0.0
		if w.get_meta(&"fade", -1.0) != alpha:
			w.set_meta(&"fade", alpha)
			for m in (w as Node3D).find_children("*", "MeshInstance3D", true, false):
				(m as MeshInstance3D).transparency = alpha
