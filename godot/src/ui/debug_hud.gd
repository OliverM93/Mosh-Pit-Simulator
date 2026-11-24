class_name DebugHud
extends CanvasLayer
## Slice HUD: performance numbers (measured, for the hardware tests), the player's current move/reaction, the last
## contact event and the control hints of the active keyboard preset.

var player: Mosher
var _label: Label
var _events: Array[String] = []
var _frame_ms := 16.7


func _ready() -> void:
	_label = Label.new()
	_label.position = Vector2(16, 12)
	_label.add_theme_font_size_override(&"font_size", 15)
	_label.add_theme_color_override(&"font_outline_color", Color.BLACK)
	_label.add_theme_constant_override(&"outline_size", 4)
	add_child(_label)


func log_event(text: String) -> void:
	_events.push_front(text)
	if _events.size() > 4:
		_events.pop_back()


func _process(delta: float) -> void:
	_frame_ms = lerpf(_frame_ms, delta * 1000.0, 0.05)
	var lines := PackedStringArray()
	lines.append("MOSH PIT – Godot slice   %d FPS  (%.1f ms)   draw calls %d   triangles %dk" % [
		Engine.get_frames_per_second(), _frame_ms,
		RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME),
		RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME) / 1000])
	if player:
		var state := str(player.current_move) if player.current_move != &"" else "-"
		lines.append("speed %.1f m/s   %s   balance %.2f" % [Vector2(player.velocity.x, player.velocity.z).length(), state, player.reactions.balance])
	for e in _events:
		lines.append(e)
	lines.append("")
	lines.append("Move WASD/stick · Sprint Shift/RT · Jump Space/A · 2-Step J/X · Kick L/B · Shove O/RB · Dodge U/LB · Peek right stick · Zoom V/R3")
	_label.text = "\n".join(lines)
