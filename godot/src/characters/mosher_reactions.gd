class_name MosherReactions
extends RefCounted
## Contact reactions (docs/GODOT_MIGRATION.md 7.5): every hit moves the body (push velocity); depending on strength,
## direction and the body's balance it is absorbed, turns into a stagger/stumble in the hit direction, or a fall with
## getting up. Reactions take over the whole body; the clips are real mocap (CMU) played in their own tempo.

const ABSORB := 1.0  ## below this speed change (m/s) a hit is only a push
const FALL := 2.7  ## above this (or with low balance) the body goes down
const RECOVER_PER_SEC := 0.35
const SOURCE_COOLDOWN := 0.4
## Getting up: start inside the lying phase of the clip and hand back once standing.
const GETUP_FROM := 1.3
const GETUP_LENGTH := 2.6

enum Kind { NONE, STAGGER, STUMBLE, FALL, GETUP }

var body: Node  # Mosher (untyped to avoid a cyclic class reference)
var kind := Kind.NONE
var balance := 1.0
var _time := 0.0
var _length := 0.0
var _recent := {}


func _init(owner_body: Node) -> void:
	body = owner_body


func active() -> bool:
	return kind != Kind.NONE


func kind_name() -> StringName:
	return [&"", &"stagger", &"stumble", &"fall", &"getup"][kind]


func modifier() -> Locomotion.Modifier:
	var m := Locomotion.Modifier.new()
	m.steer = 0.0
	m.speed = 0.0
	m.carry = 0.5
	m.lock_facing = true
	return m


func receive(dv: Vector3, from: Node3D) -> void:
	var now: float = body.clock
	if from and _recent.get(from.get_instance_id(), -INF) > now - SOURCE_COOLDOWN:
		return
	if from:
		_recent[from.get_instance_id()] = now
	dv.y = 0.0
	var strength := dv.length() / maxf(0.5, body.stability)
	body.push_velocity += dv * 0.6 / maxf(0.5, body.stability)
	balance = maxf(0.0, balance - strength * 0.22)
	if kind == Kind.FALL or kind == Kind.GETUP or strength < ABSORB:
		return
	if strength >= FALL or balance <= 0.05:
		_start(Kind.FALL, &"fall_front", strength)
		return
	var local: Vector3 = body.global_basis.inverse() * dv  # model space: +Z = facing
	if local.z < -absf(local.x):
		_start(Kind.STAGGER, &"dodge_back", strength)  # pushed backwards: quick steps back
	elif local.z > absf(local.x):
		_start(Kind.STUMBLE, &"stumble_fwd", strength)  # pushed from behind
	else:
		_start(Kind.STUMBLE, &"stumble_m" if local.x > 0.0 else &"stumble", strength)


func update(dt: float) -> void:
	balance = minf(1.0, balance + RECOVER_PER_SEC * dt)
	if kind == Kind.NONE:
		return
	_time += dt
	if _time < _length:
		return
	if kind == Kind.FALL:
		_start(Kind.GETUP, &"getup_front", 0.0, GETUP_FROM, GETUP_LENGTH)
		return
	kind = Kind.NONE
	body.animator.release_full(0.3)
	body.current_move = &""


func _start(k: Kind, clip: StringName, strength: float, offset := 0.0, length := -1.0) -> void:
	kind = k
	_time = 0.0
	var lib: ClipLibrary = body.animator.clips
	_length = length if length > 0.0 else lib.length(clip) - offset
	body.moves.interrupt(body.clock)
	body.animator.release_upper(0.1)
	body.animator.play_full(clip, offset, 0.08 if k != Kind.GETUP else 0.25)
	body.current_move = StringName("react_" + str(kind_name()))
	body.reacted.emit(body, kind_name(), strength)
