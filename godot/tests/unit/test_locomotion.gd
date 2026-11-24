extends TestCase
## Port of tests/MovementController.test.ts (momentum rules unchanged).

const DT := 1.0 / 60.0


func _run(l: Locomotion, seconds: float, move: Vector2, sprint := false, mod: Locomotion.Modifier = null) -> void:
	for i in int(seconds / DT):
		l.update(DT, move, sprint, mod)


func test_accelerates_to_walk_then_sprint_builds_slowly() -> bool:
	var l := Locomotion.new()
	_run(l, 0.5, Vector2(0, -1))
	near(l.speed, Locomotion.WALK_SPEED, 0.01, "walk reached quickly")
	_run(l, 0.2, Vector2(0, -1), true)
	check(l.speed < Locomotion.SPRINT_SPEED - 1.0, "run-up builds slowly")
	_run(l, 1.0, Vector2(0, -1), true)
	near(l.speed, Locomotion.SPRINT_SPEED, 0.01, "full sprint")
	return true


func test_reversing_at_speed_skids() -> bool:
	var l := Locomotion.new()
	l.heading = 0.0
	l.yaw = 0.0
	l.speed = 5.0
	l.update(DT, Vector2(0, -1), false)
	check(l.skidding, "skid instead of instant turn")
	check(l.speed < 5.0, "braking")
	return true


func test_standing_pivots_immediately() -> bool:
	var l := Locomotion.new()
	l.heading = 0.0
	_run(l, 0.15, Vector2(1, 0))
	near(l.heading, PI * 0.5, 0.1, "pivot to the stick")
	return true


func test_move_modifier_limits_steering() -> bool:
	var free := Locomotion.new()
	var held := Locomotion.new()
	for l in [free, held]:
		l.heading = 0.0
		l.speed = 3.0
	var mod := Locomotion.Modifier.new()
	mod.steer = 0.2
	_run(free, 0.2, Vector2(1, 0))
	_run(held, 0.2, Vector2(1, 0), false, mod)
	check(absf(held.heading) < absf(free.heading), "moves turn slower")
	return true
