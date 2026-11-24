class_name FootLock
extends SkeletonModifier3D
## Foot locking (docs/GODOT_MIGRATION.md 7.4): when the animated foot touches down and nearly stops, its world position
## is pinned and the leg is solved with two-bone IK (knee bends in the animated plane) until the animation lifts the
## foot again. Removes the residual sliding of blended/time-matched locomotion and of steering during moves.
## Godot 4.5 has no built-in two-bone IK modifier; the solver here is ~40 lines of law-of-cosines.

const PLANT_HEIGHT := 0.03  ## above the rest ankle height
const RELEASE_HEIGHT := 0.05
const PLANT_SPEED := 0.6  ## m/s – a swinging foot is much faster
## …or this share of the body speed when running (a swinging foot moves at about twice the body speed).
const PLANT_SPEED_SHARE := 0.45
const MAX_STRETCH := 0.2  ## m between pinned and animated foot before letting go
const BLEND_IN := 0.06
const BLEND_OUT := 0.12

var floor_y := 0.0
## Horizontal speed of the body (set by the mosher every tick).
var body_speed := 0.0
## Debug: how far the last solve moved an ankle and how far it missed its target (m).
var debug_shift := 0.0
var debug_error := 0.0
## Final ankle world positions of this frame (after the lock) – for measurements.
var final_world: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO]
var _legs: Array[_Leg] = []
var _rest_ankle_y := 0.072


class _Leg:
	var hip := -1
	var hip_twist := -1
	var knee := -1
	var knee_twist := -1
	var ankle := -1
	var locked := false
	var lock_pos := Vector3.ZERO
	var weight := 0.0
	var last_pos := Vector3.ZERO
	var has_last := false


func _ready() -> void:
	var sk := get_skeleton()
	if sk == null:
		return
	for s in ["L", "R"]:
		var leg := _Leg.new()
		leg.hip = sk.find_bone("upperleg01.%s" % s)
		leg.hip_twist = sk.find_bone("upperleg02.%s" % s)
		leg.knee = sk.find_bone("lowerleg01.%s" % s)
		leg.knee_twist = sk.find_bone("lowerleg02.%s" % s)
		leg.ankle = sk.find_bone("foot.%s" % s)
		_legs.append(leg)
	_rest_ankle_y = sk.get_bone_global_rest(_legs[0].ankle).origin.y


func release_all() -> void:
	for leg in _legs:
		leg.locked = false


func _process_modification_with_delta(delta: float) -> void:
	var sk := get_skeleton()
	if sk == null or _legs.is_empty():
		return
	var to_world := sk.global_transform
	var to_local := to_world.affine_inverse()
	for li in _legs.size():
		var leg := _legs[li]
		var ankle_g := sk.get_bone_global_pose(leg.ankle)
		var world := to_world * ankle_g.origin
		var speed := 0.0
		if leg.has_last and delta > 0.0:
			speed = Vector2(world.x - leg.last_pos.x, world.z - leg.last_pos.z).length() / delta
		leg.last_pos = world
		leg.has_last = true
		var height := world.y - floor_y - _rest_ankle_y
		if leg.locked:
			var stretch := Vector2(world.x - leg.lock_pos.x, world.z - leg.lock_pos.z).length()
			if height > RELEASE_HEIGHT or stretch > MAX_STRETCH:
				leg.locked = false
		elif height < PLANT_HEIGHT and speed < maxf(PLANT_SPEED, body_speed * PLANT_SPEED_SHARE):
			leg.locked = true
			leg.lock_pos = world
		leg.weight = move_toward(leg.weight, 1.0 if leg.locked else 0.0, delta / (BLEND_IN if leg.locked else BLEND_OUT))
		final_world[li] = world
		if leg.weight <= 0.001:
			continue
		var target_world := world.lerp(Vector3(leg.lock_pos.x, world.y, leg.lock_pos.z), leg.weight)
		_solve(sk, leg, to_local * target_world)
		var solved := to_world * sk.get_bone_global_pose(leg.ankle).origin
		final_world[li] = solved
		debug_shift = solved.distance_to(world)
		debug_error = solved.distance_to(target_world)


## Two-bone IK in skeleton space: rotate hip and knee so the ankle reaches `target`; the foot keeps its animated
## orientation; twist bones keep their local rotation.
func _solve(sk: Skeleton3D, leg: _Leg, target: Vector3) -> void:
	var hip_g := sk.get_bone_global_pose(leg.hip)
	var knee_g := sk.get_bone_global_pose(leg.knee)
	var ankle_g := sk.get_bone_global_pose(leg.ankle)
	var hip := hip_g.origin
	var knee := knee_g.origin
	var ankle := ankle_g.origin
	var a := hip.distance_to(knee)
	var b := knee.distance_to(ankle)
	var d := clampf(hip.distance_to(target), absf(a - b) + 0.001, a + b - 0.001)
	var bend := (knee - hip).cross(ankle - hip)
	if bend.length() < 1e-5:
		bend = hip_g.basis.x
	bend = bend.normalized()
	var to_target := (target - hip).normalized()
	var angle := acos(clampf((a * a + d * d - b * b) / (2.0 * a * d), -1.0, 1.0))
	var knee_new := hip + to_target.rotated(bend, -angle) * a
	var q1 := Quaternion((knee - hip).normalized(), (knee_new - hip).normalized())
	var shin := q1 * (ankle - knee)
	var q2 := Quaternion(shin.normalized(), (hip + to_target * d - knee_new).normalized())
	_set_global_rotation(sk, leg.hip, Basis(q1) * hip_g.basis)
	_set_global_rotation(sk, leg.knee, Basis(q2) * Basis(q1) * knee_g.basis)
	_set_global_rotation(sk, leg.ankle, ankle_g.basis)


func _set_global_rotation(sk: Skeleton3D, bone: int, global_basis: Basis) -> void:
	var parent := sk.get_bone_parent(bone)
	var parent_basis := sk.get_bone_global_pose(parent).basis if parent >= 0 else Basis()
	sk.set_bone_pose_rotation(bone, (parent_basis.inverse() * global_basis).get_rotation_quaternion())
