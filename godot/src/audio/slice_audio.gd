class_name SliceAudio
extends Node
## Sound for the slice: the test song (rendered offline from the project's own synth, no licence questions), a crowd
## ambience loop, and positional impact sounds on every contact – physical feedback is half of a hit's weight.
## Files: assets/audio (tools/audio/render_audio.mjs). Missing files are skipped silently.

const MUSIC := "res://assets/audio/music/basement_rules.ogg"
const CROWD := "res://assets/audio/sfx/crowd_loop.ogg"
const SFX := {
	&"impact_light": "res://assets/audio/sfx/impact_light.ogg",
	&"impact_heavy": "res://assets/audio/sfx/impact_heavy.ogg",
	&"whoosh": "res://assets/audio/sfx/whoosh.ogg",
	&"ooh": "res://assets/audio/sfx/ooh.ogg",
	&"cheer": "res://assets/audio/sfx/cheer.ogg",
}
const POOL := 10

var music: AudioStreamPlayer
var crowd: AudioStreamPlayer
var _streams := {}
var _pool: Array[AudioStreamPlayer3D] = []
var _next := 0


func _ready() -> void:
	music = _player(MUSIC, -4.0, true)
	crowd = _player(CROWD, -12.0, true)
	for k in SFX:
		if ResourceLoader.exists(SFX[k]):
			_streams[k] = load(SFX[k])
	for i in POOL:
		var p := AudioStreamPlayer3D.new()
		p.unit_size = 4.0
		p.max_distance = 30.0
		add_child(p)
		_pool.append(p)


func play_at(kind: StringName, pos: Vector3, volume_db := 0.0, pitch := 1.0) -> void:
	if not _streams.has(kind):
		return
	var p := _pool[_next]
	_next = (_next + 1) % POOL
	p.stream = _streams[kind]
	p.global_position = pos
	p.volume_db = volume_db
	p.pitch_scale = pitch * randf_range(0.94, 1.06)
	p.play()


## Contact sounds scale with the hit (m/s speed change).
func impact(pos: Vector3, strength: float) -> void:
	var heavy := strength > 2.2
	play_at(&"impact_heavy" if heavy else &"impact_light", pos + Vector3(0, 1.1, 0), lerpf(-10.0, 0.0, clampf(strength / 3.0, 0.0, 1.0)))


func _player(path: String, db: float, loop: bool) -> AudioStreamPlayer:
	if not ResourceLoader.exists(path):
		return null
	var p := AudioStreamPlayer.new()
	var stream: AudioStream = load(path)
	if loop and stream is AudioStreamOggVorbis:
		(stream as AudioStreamOggVorbis).loop = true
	p.stream = stream
	p.volume_db = db
	p.autoplay = true
	add_child(p)
	return p
