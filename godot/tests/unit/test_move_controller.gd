extends TestCase
## Port of tests/MoveController.test.ts, adapted to clip-defined timing (D-033).

class FakeClips:
	var lengths := {&"two_step": 1.4, &"spinkick": 0.8, &"spinkick_m": 0.8, &"jump": 1.2, &"butterfly_kick": 1.0,
		&"butterfly_kick_m": 1.0, &"shove": 0.7, &"shove_m": 0.7, &"cartwheel": 0.9, &"cartwheel_m": 0.9,
		&"tornado_kick": 0.9, &"tornado_kick_m": 0.9, &"dodge_back": 1.0}
	var airs := {&"shove": [[0.0, 0.1], [0.5, 0.6]], &"spinkick": [[0.2, 0.4]], &"spinkick_m": [[0.2, 0.4]], &"jump": [[0.35, 0.75]],
		&"butterfly_kick": [[0.2, 0.75]], &"butterfly_kick_m": [[0.2, 0.75]]}
	func length(c): return lengths.get(c, 1.0)
	func get_info(c):
		var i = ClipLibrary.ClipInfo.new()
		i.air = airs.get(c, [])
		return i
	func resolve(c, mirror): return StringName(str(c) + "_m") if mirror and lengths.has(StringName(str(c) + "_m")) else c

var S := MoveController.Situation


func _mc() -> MoveController:
	return MoveController.new(Moves.all(), FakeClips.new())


func test_resolve_by_situation() -> bool:
	var mc := _mc()
	eq(mc.resolve(&"kick", S.of(Vector2.ZERO, 0.0)).id, &"spinkick", "standing kick")
	eq(mc.resolve(&"kick", S.of(Vector2.ZERO, 5.0)).id, &"tornado_kick", "run-up kick")
	eq(mc.resolve(&"kick", S.of(Vector2.ZERO, 0.0, true)).id, &"butterfly_kick", "kick in the air")
	eq(mc.resolve(&"acro", S.of(Vector2(1, 0), 0.0)).id, &"cartwheel", "jump + side")
	eq(mc.resolve(&"acro", S.of(Vector2(0, 1), 0.0)).id, &"jump", "jump forward")
	return true


func test_length_and_phases_come_from_the_clip() -> bool:
	var mc := _mc()
	mc.press(&"kick", 0.0, S.of(Vector2.ZERO, 0.0))
	eq(mc.full.length, 0.8, "clip length")
	eq(mc.full.land_at, 0.4, "landing = end of airborne phase")
	near(mc.full.cancel_at, 0.5, 1e-4, "cancel after landing recovery")
	return true


func test_buffered_press_fires_when_window_opens() -> bool:
	var mc := _mc()
	var s := S.of(Vector2.ZERO, 0.0)
	mc.press(&"kick", 0.0, s)
	var first := mc.full
	mc.press(&"footwork", 0.3, s)  # window opens at 0.5
	mc.update(0.4, s)
	check(mc.full == first, "still kicking")
	mc.update(0.5, s)
	eq(mc.full.def.id, &"two_step", "buffered 2-step starts at the window")
	check(mc.full.linked, "linked")
	return true


func test_stale_buffer_expires() -> bool:
	var mc := _mc()
	var s := S.of(Vector2.ZERO, 0.0)
	mc.press(&"kick", 0.0, s)
	mc.press(&"footwork", 0.05, s)
	mc.update(0.5, s)
	eq(mc.full.def.id, &"spinkick", "press older than 0.3 s is dropped")
	return true


func test_upper_layer_runs_over_footwork() -> bool:
	var list := Moves.all()
	list.append(MoveDef.make({id = &"arm_test", category = &"arms", layer = &"upper", clip = &"shove"}))
	var mc := MoveController.new(list, FakeClips.new())
	var s := S.of(Vector2.ZERO, 0.0)
	mc.press(&"footwork", 0.0, s)
	mc.press(&"arms", 0.1, s)
	eq(mc.full.def.id, &"two_step", "footwork keeps running")
	eq(mc.upper.def.id, &"arm_test", "arms on the upper layer")
	check(mc.upper.layered, "layered")
	return true


func test_two_step_halves_alternate_and_repeat_on_hold() -> bool:
	var mc := _mc()
	var s := S.of(Vector2.ZERO, 0.0)
	mc.press(&"footwork", 0.0, s)
	eq(mc.full.offset, 0.0, "first half")
	near(mc.full.length, 0.7, 1e-4, "half of the cycle")
	mc.hold(&"footwork", 0.5, s)
	eq(mc.full.offset, 0.0, "hold does not cut the step short")
	mc.hold(&"footwork", 0.69, s)
	near(mc.full.offset, 0.7, 1e-4, "second half follows")
	return true


func test_kick_in_air_enters_at_airborne_phase() -> bool:
	var mc := _mc()
	var s := S.of(Vector2.ZERO, 0.0)
	mc.press(&"acro", 0.0, s)
	eq(mc.full.def.id, &"jump")
	mc.update(0.4, S.of(Vector2.ZERO, 0.0, true))
	check(mc.airborne(0.4), "airborne in the jump")
	# Kick during the flight phase takes over the jump and enters the butterfly kick at its airborne phase.
	mc.press(&"kick", 0.4, S.of(Vector2.ZERO, 0.0, true))
	eq(mc.full.def.id, &"butterfly_kick", "jump → kick in the air = butterfly")
	near(mc.full.offset, 0.2, 1e-4, "entered at the clip's takeoff")
	return true


func test_interrupt_stops_everything() -> bool:
	var mc := _mc()
	var s := S.of(Vector2.ZERO, 0.0)
	mc.press(&"footwork", 0.0, s)
	mc.interrupt(0.2)
	check(mc.full == null and mc.upper == null, "all layers stopped")
	return true


func test_small_hops_in_ground_moves_are_not_airborne() -> bool:
	var mc := _mc()
	var s := S.of(Vector2.ZERO, 0.0)
	mc.press(&"interact", 0.0, s)
	check(not mc.airborne(0.55), "boxing footwork hop is not a flight phase")
	mc.press(&"acro", 0.6, S.of(Vector2.ZERO, 0.0, mc.airborne(0.6)))
	eq(mc.full.def.id, &"jump", "jump out of the shove's cancel window")
	return true
