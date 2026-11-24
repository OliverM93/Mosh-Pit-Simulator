class_name PlayerBrain
extends RefCounted
## Reads the Input Map (docs/CONTROLS.md) into the body's intent. The camera always faces the band (-Z), so stick
## "up" is always towards the stage – directions never change under the player's thumb.

## Input action -> move category (MoveDef.category).
const ACTION_CATEGORY := {
	&"jump": &"acro", &"footwork": &"footwork", &"arms": &"arms", &"kick": &"kick",
	&"interact": &"interact", &"dodge": &"dodge",
}
const HOLDABLE := [&"footwork", &"arms"]


func think(body: Mosher, _delta: float) -> void:
	var v := Input.get_vector(&"move_left", &"move_right", &"move_back", &"move_forward")
	body.stick = v
	body.move_input = Vector2(v.x, -v.y)
	body.sprint = Input.get_action_strength(&"sprint") > 0.5
	body.held.clear()
	for action in ACTION_CATEGORY:
		if Input.is_action_just_pressed(action):
			body.press(ACTION_CATEGORY[action])
		if action in HOLDABLE and Input.is_action_pressed(action):
			body.held.append(ACTION_CATEGORY[action])
