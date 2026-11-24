extends Node3D
## Vertical slice (D-033): The Basement, a playable mosher, 10 NPC moshers, a pit wall of watchers, contacts and the
## first mosh interactions. Everything is assembled here so the slice is one readable entry point.

@export var npc_count := 10
@export var watcher_count := 26

var player: Mosher
var crowd: CrowdDirector
var hud: DebugHud
var audio: SliceAudio


func _ready() -> void:
	InputConfig.apply()
	var library := ClipLibrary.shared()
	var venue := Basement.new()
	venue.name = "Basement"
	add_child(venue)
	crowd = CrowdDirector.new()
	crowd.name = "Crowd"
	crowd.npc_count = npc_count
	crowd.watcher_count = watcher_count
	crowd.pit_center = Basement.PIT_CENTER
	crowd.pit_radius = Basement.PIT_RADIUS
	crowd.stage_front_z = venue.stage_front_z()
	add_child(crowd)
	player = Mosher.new()
	player.name = "Player"
	add_child(player)
	player.setup("player", library, 90.0)
	player.global_position = Basement.PIT_CENTER + Vector3(0, 0, 1.2)
	player.brain = PlayerBrain.new()
	player.stability = 1.6
	player.recover_after = 0.35
	player.add_to_group(&"moshers")
	player.add_to_group(&"player")
	crowd.spawn(library)
	var cam := PitCamera.new()
	cam.name = "PitCamera"
	cam.target = player
	add_child(cam)
	audio = SliceAudio.new()
	audio.name = "Audio"
	add_child(audio)
	hud = DebugHud.new()
	hud.player = player
	add_child(hud)
	for m in get_tree().get_nodes_in_group(&"moshers"):
		(m as Mosher).reacted.connect(_on_reacted)
		(m as Mosher).hit_landed.connect(_on_hit)
		(m as Mosher).move_started.connect(_on_move_started)


func _on_move_started(m: Mosher, move: MoveController.ActiveMove) -> void:
	if move.def.category == &"kick" or move.def.category == &"acro":
		audio.play_at(&"whoosh", m.global_position + Vector3(0, 1.0, 0), -8.0 if m != player else -3.0)


func _on_reacted(m: Mosher, kind: StringName, strength: float) -> void:
	audio.impact(m.global_position, strength)
	if kind == &"fall":
		audio.play_at(&"ooh", m.global_position, -6.0)
	if m == player or strength > 2.0:
		hud.log_event("%s: %s (%.1f m/s)" % [m.name, kind, strength])


func _on_hit(m: Mosher, target: Mosher, strength: float) -> void:
	if m == player or target == player:
		hud.log_event("%s hits %s (%.1f m/s)" % [m.name, target.name, strength])
