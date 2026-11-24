class_name Moves
extends RefCounted
## Move list of the vertical slice (data, D-028/D-034). Order matters inside a category: the first definition whose
## conditions match wins. Lengths and phases come from the clips (D-033) – only exceptions are set here.
## Moves of the Three.js prototype without a suitable free clip yet (Windmill, Arm Swing) stay listed in
## docs/COMBO_SYSTEM.md and return once a capture exists.

static func all() -> Array[MoveDef]:
	var list: Array[MoveDef] = []
	list.append(MoveDef.make({
		id = &"two_step", display_name = "2-Step", category = &"footwork", clip = &"two_step", half_cycle = true,
		repeat_on_hold = true, root_motion = false, steer = 0.85, speed_factor = 0.45, carry = 0.6,
		points = 50, difficulty = 0.4, space = 0.6, hint = "Footwork (hold = keep stepping)"}))
	list.append(MoveDef.make({
		id = &"butterfly_kick", display_name = "Butterfly Kick", category = &"kick", when_airborne = true,
		clip = &"butterfly_kick", alternate = true, enter_at_air = true, steer = 0.2, speed_factor = 1.0, carry = 0.9,
		impulse = 3.5, hit_radius = 1.2, hit_at = 0.45, points = 700, difficulty = 1.8, space = 1.2, risky = true,
		hint = "Jump, then Kick"}))
	list.append(MoveDef.make({
		id = &"tornado_kick", display_name = "Tornado Kick", category = &"kick", when_min_speed = 4.0,
		clip = &"tornado_kick", alternate = true, steer = 0.25, speed_factor = 1.0, carry = 0.95,
		impulse = 3.5, hit_radius = 1.2, hit_at = 0.55, points = 600, difficulty = 1.6, space = 1.1, risky = true,
		hint = "Kick with run-up"}))
	list.append(MoveDef.make({
		id = &"spinkick", display_name = "Spinkick", category = &"kick", clip = &"spinkick", alternate = true,
		steer = 0.3, speed_factor = 0.5, carry = 0.7, impulse = 3.0, hit_radius = 1.1, hit_at = 0.32,
		points = 300, difficulty = 1.0, space = 1.0, risky = true, hint = "Kick"}))
	list.append(MoveDef.make({
		id = &"cartwheel", display_name = "Cartwheel", category = &"acro", when_side = true, when_grounded = true,
		clip = &"cartwheel", alternate = true, steer = 0.15, speed_factor = 0.9, carry = 0.9,
		points = 450, difficulty = 1.3, space = 1.0, risky = true, hint = "Jump + left/right"}))
	list.append(MoveDef.make({
		id = &"jump", display_name = "Jump", category = &"acro", when_grounded = true, clip = &"jump", air_cancel_into = [&"kick"],
		root_motion = false, steer = 0.6, speed_factor = 1.0, carry = 0.95, points = 40, difficulty = 0.3,
		space = 0.5, hint = "Jump (Kick in the air = Butterfly)"}))
	list.append(MoveDef.make({
		id = &"shove", display_name = "Shove", category = &"interact", clip = &"shove", cancel_at = 0.5,
		alternate = true, steer = 0.4, speed_factor = 0.6, carry = 0.7, impulse = 2.6, hit_radius = 1.3,
		points = 60, difficulty = 0.3, space = 0.6, hint = "Interact: shove the person in front"}))
	list.append(MoveDef.make({
		id = &"dodge", display_name = "Dodge", category = &"dodge", clip = &"dodge_back", cancel_at = 0.55,
		steer = 0.5, speed_factor = 1.0, carry = 0.5, points = 0, space = 0.4, hint = "Dodge"}))
	return list
