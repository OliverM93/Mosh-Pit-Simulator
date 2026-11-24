class_name InputConfig
extends RefCounted
## Central input bindings (docs/CONTROLS.md, D-034). Every game input is a named Input Map action; presets and user
## overrides only change data. The chosen preset is stored in user://input.cfg (rebinding UI: phase 4).

const SAVE_PATH := "user://input.cfg"
const DEADZONE := 0.2

const MOVE_ACTIONS := [&"move_left", &"move_right", &"move_forward", &"move_back"]
const LOOK_ACTIONS := [&"look_left", &"look_right"]
const ACTIONS := [
	&"sprint", &"jump", &"footwork", &"arms", &"kick", &"interact", &"dodge", &"headbang",
	&"camera_zoom", &"pause", &"move_list",
]

## Keyboard presets: action -> physical keys. Gamepad bindings are the same for every preset.
const KEYBOARD_PRESETS := {
	"standard": {
		&"move_forward": [KEY_W], &"move_back": [KEY_S], &"move_left": [KEY_A], &"move_right": [KEY_D],
		&"sprint": [KEY_SHIFT], &"jump": [KEY_SPACE, KEY_K], &"footwork": [KEY_J], &"arms": [KEY_I], &"kick": [KEY_L],
		&"interact": [KEY_O], &"dodge": [KEY_U], &"headbang": [KEY_E], &"camera_zoom": [KEY_V],
		&"pause": [KEY_ESCAPE], &"move_list": [KEY_TAB],
	},
	"classic": {
		&"move_forward": [KEY_W, KEY_UP], &"move_back": [KEY_S, KEY_DOWN], &"move_left": [KEY_A, KEY_LEFT],
		&"move_right": [KEY_D, KEY_RIGHT], &"sprint": [KEY_SHIFT], &"jump": [KEY_SPACE], &"footwork": [KEY_Q],
		&"arms": [KEY_E], &"kick": [KEY_R], &"interact": [KEY_F], &"dodge": [KEY_C], &"headbang": [KEY_X],
		&"camera_zoom": [KEY_V], &"pause": [KEY_ESCAPE], &"move_list": [KEY_TAB],
	},
}

const PAD_BUTTONS := {
	&"jump": [JOY_BUTTON_A], &"footwork": [JOY_BUTTON_X], &"arms": [JOY_BUTTON_Y], &"kick": [JOY_BUTTON_B],
	&"interact": [JOY_BUTTON_RIGHT_SHOULDER], &"dodge": [JOY_BUTTON_LEFT_SHOULDER], &"camera_zoom": [JOY_BUTTON_RIGHT_STICK],
	&"pause": [JOY_BUTTON_START], &"move_list": [JOY_BUTTON_BACK],
}
## action -> [axis, direction]
const PAD_AXES := {
	&"move_left": [JOY_AXIS_LEFT_X, -1.0], &"move_right": [JOY_AXIS_LEFT_X, 1.0],
	&"move_forward": [JOY_AXIS_LEFT_Y, -1.0], &"move_back": [JOY_AXIS_LEFT_Y, 1.0],
	&"look_left": [JOY_AXIS_RIGHT_X, -1.0], &"look_right": [JOY_AXIS_RIGHT_X, 1.0],
	&"sprint": [JOY_AXIS_TRIGGER_RIGHT, 1.0], &"headbang": [JOY_AXIS_TRIGGER_LEFT, 1.0],
}

static var preset := "standard"


## Fill the Input Map. Call once at startup (main scene); safe to call again after changing the preset.
static func apply(preset_name := "") -> void:
	if preset_name == "":
		preset_name = _load_preset()
	preset = preset_name if KEYBOARD_PRESETS.has(preset_name) else "standard"
	var keys: Dictionary = KEYBOARD_PRESETS[preset]
	for action in MOVE_ACTIONS + LOOK_ACTIONS + ACTIONS:
		if InputMap.has_action(action):
			InputMap.erase_action(action)
		InputMap.add_action(action, DEADZONE)
		for k in keys.get(action, []):
			var e := InputEventKey.new()
			e.physical_keycode = k
			InputMap.action_add_event(action, e)
		for b in PAD_BUTTONS.get(action, []):
			var e := InputEventJoypadButton.new()
			e.button_index = b
			InputMap.action_add_event(action, e)
		if PAD_AXES.has(action):
			var e := InputEventJoypadMotion.new()
			e.axis = PAD_AXES[action][0]
			e.axis_value = PAD_AXES[action][1]
			InputMap.action_add_event(action, e)


static func save_preset(preset_name: String) -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("input", "preset", preset_name)
	cfg.save(SAVE_PATH)
	apply(preset_name)


static func _load_preset() -> String:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) != OK:
		return "standard"
	return cfg.get_value("input", "preset", "standard")
