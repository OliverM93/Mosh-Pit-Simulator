class_name NpcBrain
extends RefCounted
## Autonomous pit behaviour for one NPC: wanders inside the pit, two-steps for a while, throws the occasional kick or
## jump when there is room, and – depending on its personality – shoves people (including the player) in front of it.
## Every NPC has its own tempo, so the crowd never moves in lockstep.

var pit_center := Vector3.ZERO
var pit_radius := 3.5
## 0..1 personality.
var energy := 0.6
var aggression := 0.3
var rng := RandomNumberGenerator.new()

var _target := Vector3.ZERO
var _mode := &"wander"
var _mode_left := 0.0
var _shove_cooldown := 0.0


func _init(seed_value: int, energy_v: float, aggression_v: float) -> void:
	rng.seed = seed_value
	energy = energy_v
	aggression = aggression_v
	_mode_left = rng.randf_range(0.5, 3.0)


func think(body: Mosher, delta: float) -> void:
	_mode_left -= delta
	_shove_cooldown -= delta
	body.held.clear()
	body.sprint = false
	var pos := body.global_position
	if _mode_left <= 0.0:
		_pick_mode(body)
	var to_target := _target - pos
	to_target.y = 0.0
	if to_target.length() < 0.4:
		_target = _random_point()
	var dir := to_target.normalized() if to_target.length() > 0.01 else Vector3.ZERO
	# Keep a little personal space unless looking for trouble.
	var player := body.get_tree().get_first_node_in_group(&"player") as Mosher
	if player:
		var away := pos - player.global_position
		away.y = 0.0
		var d := away.length()
		if d < 1.6 and d > 0.01 and aggression < 0.5:
			dir = (dir + away / d * (1.6 - d) * 1.5).normalized()
		if _shove_cooldown <= 0.0 and d < 1.3 and rng.randf() < aggression * delta * 3.0:
			_face_and_shove(body, -away)
	dir = (dir + _separation(body) * 1.2).normalized() if dir != Vector3.ZERO else _separation(body)
	match _mode:
		&"wander":
			body.move_input = Vector2(dir.x, dir.z) * lerpf(0.35, 0.8, energy)
		&"two_step":
			body.move_input = Vector2(dir.x, dir.z) * 0.3
			body.held.append(&"footwork")
			if body.moves.full == null:
				body.press(&"footwork")
		&"pogo":
			body.move_input = Vector2.ZERO
			if body.moves.full == null:
				body.press(&"acro")
		&"push":
			body.move_input = Vector2(dir.x, dir.z) * 1.0
			body.sprint = energy > 0.7
		_:
			body.move_input = Vector2.ZERO
	body.stick = Vector2(body.move_input.x, -body.move_input.y)


func _pick_mode(body: Mosher) -> void:
	var r := rng.randf()
	if r < 0.35:
		_mode = &"two_step"
		_mode_left = rng.randf_range(2.0, 5.0)
	elif r < 0.5 + aggression * 0.2:
		_mode = &"push"
		_mode_left = rng.randf_range(1.0, 2.5)
		_target = _random_point()
	elif r < 0.62:
		_mode = &"pogo"
		_mode_left = rng.randf_range(1.5, 3.0)
	elif r < 0.75 and _free_space(body) > 1.4:
		_mode = &"kick"
		_mode_left = 1.2
		body.press(&"kick")
	else:
		_mode = &"wander"
		_mode_left = rng.randf_range(1.5, 4.0)
		_target = _random_point()


func _face_and_shove(body: Mosher, toward: Vector3) -> void:
	_shove_cooldown = rng.randf_range(2.0, 4.0)
	body.turn_towards(atan2(toward.x, toward.z))
	body.press(&"interact")


## Steer away from bodies closer than ~1.1 m (stronger the closer they are).
func _separation(body: Mosher) -> Vector3:
	var push := Vector3.ZERO
	for o in body.get_tree().get_nodes_in_group(&"moshers"):
		if o == body:
			continue
		var d: Vector3 = body.global_position - o.global_position
		d.y = 0.0
		var dist := d.length()
		if dist < 1.1 and dist > 0.01:
			push += d / dist * (1.1 - dist)
	return push


func _free_space(body: Mosher) -> float:
	var best := INF
	for o in body.get_tree().get_nodes_in_group(&"moshers"):
		if o != body:
			best = minf(best, body.global_position.distance_to(o.global_position))
	return best


func _random_point() -> Vector3:
	var a := rng.randf() * TAU
	var r := sqrt(rng.randf()) * pit_radius * 0.85
	return pit_center + Vector3(sin(a) * r, 0.0, cos(a) * r)
