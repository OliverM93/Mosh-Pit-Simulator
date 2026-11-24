class_name Locomotion
extends RefCounted
## Momentum-based ground movement (port of src/gameplay/MovementController.ts, MOVEMENT_TUNING unchanged): speed and
## heading are separate, turning gets wider with speed, reversing skids, sprinting slowly builds a run-up. Moves only
## scale these rules. Angles: 0 = +Z, direction = (sin a, 0, cos a). Pure – the body applies `velocity()`.

const WALK_SPEED := 3.1
const SPRINT_SPEED := 5.8
const ACCEL := 16.0
const SPRINT_ACCEL := 4.5
const FRICTION := 11.0
const BRAKE := 24.0
const SKID_ANGLE := 2.2
const TURN_RATE_SLOW := 16.0
const TURN_RATE_FAST := 4.2
const PIVOT_SPEED := 0.6
const FACE_RATE := 14.0

var speed := 0.0
var heading := PI
var yaw := PI
var skidding := false


## How a running move changes locomotion (null = free running).
class Modifier:
	var steer := 1.0
	var speed := 1.0
	var carry := 0.0
	var lock_facing := false

	static func of(def: MoveDef, lock := false) -> Modifier:
		var m := Modifier.new()
		m.steer = def.steer
		m.speed = def.speed_factor
		m.carry = def.carry
		m.lock_facing = lock
		return m


func velocity() -> Vector3:
	return Vector3(sin(heading), 0.0, cos(heading)) * speed


## 0..1 share of full sprint speed (scoring, move selection).
func momentum() -> float:
	return clampf(speed / SPRINT_SPEED, 0.0, 1.0)


## `move`: desired world direction (x, z), length 0..1.
func update(dt: float, move: Vector2, sprint: bool, mod: Modifier = null) -> void:
	var steer := mod.steer if mod else 1.0
	var speed_factor := mod.speed if mod else 1.0
	var carry := mod.carry if mod else 0.0
	var mag := minf(1.0, move.length())
	skidding = false
	if mag > 0.1:
		var want := atan2(move.x, move.y)
		var target := (SPRINT_SPEED if sprint and mod == null else WALK_SPEED) * mag * speed_factor
		if speed < PIVOT_SPEED:
			heading = _damp_angle(heading, want, 30.0 * steer + 4.0, dt)
		else:
			var diff := wrapf(want - heading, -PI, PI)
			if absf(diff) > SKID_ANGLE and steer > 0.5:
				skidding = true
				speed = maxf(0.0, speed - BRAKE * dt)
			else:
				var rate := lerpf(TURN_RATE_SLOW, TURN_RATE_FAST, clampf(speed / SPRINT_SPEED, 0.0, 1.0)) * steer
				heading = wrapf(heading + clampf(diff, -rate * dt, rate * dt), -PI, PI)
		if not skidding:
			if speed < target:
				var a := ACCEL if speed < WALK_SPEED else SPRINT_ACCEL
				speed = minf(target, speed + a * dt * maxf(0.3, steer))
			else:
				speed = maxf(target, speed - FRICTION * (1.0 - carry * 0.8) * dt)
	else:
		speed = maxf(0.0, speed - FRICTION * (1.0 - carry * 0.85) * dt)
	if not (mod and mod.lock_facing) and speed > 0.15:
		yaw = _damp_angle(yaw, heading, FACE_RATE, dt)


## Hitting a wall/body: keep only the part of the velocity along `normal`'s tangent.
func slide_along(normal: Vector3) -> void:
	var v := velocity()
	var out := v.dot(normal)
	if out >= 0.0:
		return
	var t := v - normal * out
	if t.length() > 0.3:
		heading = atan2(t.x, t.z)
	speed = t.length() * 0.85


static func _damp_angle(a: float, b: float, rate: float, dt: float) -> float:
	return a + wrapf(b - a, -PI, PI) * (1.0 - exp(-rate * dt))
