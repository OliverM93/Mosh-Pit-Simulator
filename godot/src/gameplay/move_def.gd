class_name MoveDef
extends Resource
## One move as data (port of MoveDefinition, src/gameplay/moveTypes.ts). Timing comes from the clip (D-033):
## the length is the clip's own length, phases come from its measured markers; values here only pick *which*
## phase opens the cancel window or when a hit lands, as clip seconds.

@export var id: StringName
@export var display_name := ""
## footwork | arms | kick | acro | interact | dodge
@export var category: StringName
## full = whole body · upper = arms/torso over locomotion and footwork
@export var layer: StringName = &"full"

@export_group("Selection")
@export var when_side := false
@export var when_forward := false
@export var when_min_speed := -1.0
## Only while airborne (true) / only on the ground (false via when_grounded).
@export var when_airborne := false
@export var when_grounded := false

@export_group("Clip")
@export var clip: StringName
## The clip is a full left/right cycle: one move = one half; alternation picks the half.
@export var half_cycle := false
## Mirror on every second consecutive use.
@export var alternate := false
## Started in the air (from a jump): skip the clip's takeoff and enter at its airborne phase.
@export var enter_at_air := false
## Use the clip's horizontal travel (root motion).
@export var root_motion := true

@export_group("Timing (clip seconds, -1 = from the clip's phases)")
@export var cancel_at := -1.0
@export var repeat_at := -1.0
@export var hit_at := -1.0
@export var repeat_on_hold := false
@export var cancel_into: Array[StringName] = [&"footwork", &"arms", &"kick", &"acro", &"interact", &"dodge"]

@export_group("Movement while running")
@export_range(0, 1) var steer := 0.3
@export var speed_factor := 0.6
@export_range(0, 1) var carry := 0.7

@export_group("Contact")
## Speed change (m/s) given to people hit within hit_radius in front.
@export var impulse := 0.0
@export var hit_radius := 0.0

@export_group("Score")
@export var points := 0
@export var difficulty := 0.0
@export var space := 0.6
@export var risky := false
@export var hint := ""


static func make(props: Dictionary) -> MoveDef:
	var d := MoveDef.new()
	for k in props:
		d.set(k, props[k])
	return d
