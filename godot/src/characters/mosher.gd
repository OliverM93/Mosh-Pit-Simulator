class_name Mosher
extends CharacterBody3D
## One body in the pit – player and NPCs share it (D-032: "a body for everyone"); a brain (PlayerBrain / NpcBrain)
## only fills the intent fields each physics tick. The body owns locomotion, moves, animation and contact reactions.

signal move_started(mosher: Mosher, move: MoveController.ActiveMove)
signal hit_landed(mosher: Mosher, target: Mosher, strength: float)
signal reacted(mosher: Mosher, kind: StringName, strength: float)

const VARIANT_PATH := "res://assets/characters/char_%s.glb"
const RADIUS := 0.3
const HEIGHT := 1.78
## Fades (s): moves start/end against locomotion, reactions cut in fast.
const FADE_IN := 0.12
const FADE_OUT := 0.25
const FADE_REACT := 0.08
const PUSH_DECAY := 6.0

# --- Intent (written by the brain every physics tick) ---
var move_input := Vector2.ZERO  ## world direction (x, z), length 0..1
var stick := Vector2.ZERO  ## x = right, y = towards the band (move selection)
var sprint := false
var held: Array[StringName] = []
var _presses: Array[StringName] = []

# --- State ---
var variant := "c1"
var mass_kg := 80.0
## Divides incoming hits: >1 = harder to knock over (the player keeps control, D-034).
var stability := 1.0
var clock := 0.0
var loco := Locomotion.new()
var moves: MoveController
var animator: MosherAnimator
var reactions: MosherReactions
var foot_lock: FootLock
## Foot locking on/off (measurements, settings).
var use_foot_lock := true
var model: Node3D
var push_velocity := Vector3.ZERO
var current_move: StringName = &""
## PlayerBrain / NpcBrain: `think(body, delta)` fills the intent fields before the body moves.
var brain: RefCounted


func setup(variant_id: String, library: ClipLibrary, body_mass := 80.0) -> void:
	variant = variant_id
	mass_kg = body_mass
	collision_layer = 2
	collision_mask = 1 | 2 | 4
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = RADIUS
	capsule.height = HEIGHT
	shape.shape = capsule
	shape.position.y = HEIGHT * 0.5
	add_child(shape)
	model = (load(VARIANT_PATH % variant_id) as PackedScene).instantiate()
	add_child(model)
	animator = MosherAnimator.new()
	animator.name = "Animator"
	add_child(animator)
	animator.setup(model, library)
	foot_lock = FootLock.new()
	foot_lock.name = "FootLock"
	model.get_node(ClipLibrary.SKELETON_PATH).add_child(foot_lock)
	moves = MoveController.new(Moves.all(), library)
	moves.move_started.connect(_on_move_started)
	moves.move_hit.connect(_on_move_hit)
	reactions = MosherReactions.new(self)
	rotation.y = loco.yaw


func press(action: StringName) -> void:
	_presses.append(action)


func face(yaw: float) -> void:
	loco.yaw = yaw
	loco.heading = yaw
	rotation.y = yaw


func situation() -> MoveController.Situation:
	return MoveController.Situation.of(stick, loco.speed, moves.airborne(clock))


## Speed change from outside (shoves, collisions, kicks); the reaction picks stagger / stumble / fall.
func receive_impulse(dv: Vector3, from: Node3D = null) -> void:
	reactions.receive(dv, from)


func _process(delta: float) -> void:
	animator.advance(delta)


func _physics_process(delta: float) -> void:
	clock += delta
	if brain:
		brain.think(self, delta)
	var s := situation()
	reactions.update(delta)
	if reactions.active():
		_presses.clear()
	else:
		for a in _presses:
			moves.press(a, clock, s)
		_presses.clear()
		for a in held:
			moves.hold(a, clock, s)
		moves.update(clock, s)
	_update_layers()
	var full := moves.full
	var mod: Locomotion.Modifier = null
	if reactions.active():
		mod = reactions.modifier()
	elif full:
		mod = Locomotion.Modifier.of(full.def, true)
	elif moves.upper:
		mod = Locomotion.Modifier.of(moves.upper.def)
	loco.update(delta, move_input if not reactions.active() else Vector2.ZERO, sprint, mod)
	rotation.y = loco.yaw
	var rm := global_basis * animator.consume_root_motion()
	var v := loco.velocity()
	if (full and full.def.root_motion) or reactions.active():
		v += Vector3(rm.x, 0.0, rm.z) / maxf(delta, 1e-4)
	v += push_velocity
	push_velocity = push_velocity * exp(-PUSH_DECAY * delta)
	velocity = Vector3(v.x, velocity.y - 9.8 * delta if not is_on_floor() else 0.0, v.z)
	move_and_slide()
	_resolve_contacts()
	# Lying on the floor or rolling: no foot pinning.
	var down := reactions.kind == MosherReactions.Kind.FALL or reactions.kind == MosherReactions.Kind.GETUP
	var want := use_foot_lock and not down
	if foot_lock.active != want:
		foot_lock.active = want
		foot_lock.release_all()
	foot_lock.body_speed = Vector2(velocity.x, velocity.z).length()
	animator.set_speed(0.0 if (full or reactions.active()) else Vector2(velocity.x, velocity.z).length())


func _update_layers() -> void:
	if reactions.active():
		return
	if moves.full == null and animator.full_weight() > 0.0 and current_move != &"":
		animator.release_full(FADE_OUT)
		current_move = &""
	if moves.upper == null:
		animator.release_upper(FADE_OUT)


func _on_move_started(m: MoveController.ActiveMove) -> void:
	if m.def.category == &"interact":
		_aim_at_nearest(1.8, deg_to_rad(80.0))
	if m.def.layer == &"upper":
		animator.play_upper(m.clip, m.offset)
	else:
		animator.play_full(m.clip, m.offset, FADE_IN)
		current_move = m.def.id
	move_started.emit(self, m)


func _on_move_hit(m: MoveController.ActiveMove) -> void:
	if m.def.impulse <= 0.0:
		return
	var forward := Vector3(sin(loco.yaw), 0.0, cos(loco.yaw))
	for other in get_tree().get_nodes_in_group(&"moshers"):
		if other == self:
			continue
		var d: Vector3 = other.global_position - global_position
		d.y = 0.0
		var dist := d.length()
		if dist > m.def.hit_radius or dist < 0.01:
			continue
		# Spins hit all around, shoves only in front.
		if m.def.category == &"interact" and forward.dot(d / dist) < 0.5:
			continue
		var strength := m.def.impulse * (1.0 - 0.4 * dist / m.def.hit_radius)
		other.receive_impulse(d / dist * strength, self)
		hit_landed.emit(self, other, strength)


## Bodies running into each other: the faster/heavier one pushes, the other gives way or reacts.
func _resolve_contacts() -> void:
	for i in get_slide_collision_count():
		var c := get_slide_collision(i)
		var hit := c.get_collider()
		if hit is StaticBody3D and hit.has_meta(&"watcher"):
			_bounce_off_wall(hit.get_meta(&"watcher"), c.get_normal())
			continue
		var other := hit as Mosher
		if other == null:
			continue
		var n := -c.get_normal()  # from me towards the other
		n.y = 0.0
		if n.length() < 0.01:
			continue
		n = n.normalized()
		var closing := (Vector3(velocity.x, 0, velocity.z) - Vector3(other.velocity.x, 0, other.velocity.z)).dot(n)
		var mine := Vector3(loco.velocity().x, 0, loco.velocity().z).dot(n)
		if mine <= 0.2:
			continue
		var share := mass_kg / (mass_kg + other.mass_kg)
		other.receive_impulse(n * maxf(closing, mine) * share * 1.1, self)
		loco.slide_along(-n)


## The pit wall of people pushes back: fast runs into it bounce the body back into the pit.
func _bounce_off_wall(watcher: Node, normal: Vector3) -> void:
	normal.y = 0.0
	var into := -loco.velocity().dot(normal.normalized())
	if into > 1.5:
		watcher.shove_back()
		receive_impulse(normal.normalized() * into * 0.9, watcher)
	loco.slide_along(normal.normalized())


## Turn towards the closest person inside a cone in front (shoves find their target, D-034).
func _aim_at_nearest(radius: float, half_angle: float) -> void:
	var forward := Vector3(sin(loco.yaw), 0.0, cos(loco.yaw))
	var best: Node3D = null
	var best_d := radius
	for other in get_tree().get_nodes_in_group(&"moshers"):
		if other == self:
			continue
		var d: Vector3 = other.global_position - global_position
		d.y = 0.0
		var dist := d.length()
		if dist < best_d and dist > 0.01 and forward.angle_to(d) < half_angle:
			best = other
			best_d = dist
	if best:
		var d := best.global_position - global_position
		face(atan2(d.x, d.z))
