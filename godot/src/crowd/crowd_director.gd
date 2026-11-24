class_name CrowdDirector
extends Node3D
## Spawns and scales the crowd (docs/GODOT_MIGRATION.md 7.6): tier A = moshers in the pit with full bodies, brains and
## contact reactions; tier B = the pit wall of watchers (cheap animation, static capsules). Counts are settings so the
## crowd scales with the hardware.

const VARIANTS := ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"]
## Body mass per variant (kg): heavier bodies push harder and fall less.
const MASS := {"c1": 78.0, "c2": 105.0, "c3": 68.0, "c4": 95.0, "c5": 92.0, "c6": 75.0, "c7": 100.0, "c8": 80.0}

@export var npc_count := 10
@export var watcher_count := 26
@export var seed_value := 1337

var pit_center := Vector3.ZERO
var pit_radius := 3.4
var stage_front_z := -4.1
var npcs: Array[Mosher] = []
var watchers: Array[Watcher] = []


func spawn(library: ClipLibrary) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	for i in npc_count:
		var v: String = VARIANTS[i % VARIANTS.size()]
		var m := Mosher.new()
		m.name = "Npc%d" % i
		add_child(m)
		m.setup(v, library, MASS[v])
		var a := TAU * i / npc_count + rng.randf_range(-0.3, 0.3)
		var r := rng.randf_range(1.2, pit_radius * 0.8)
		m.global_position = pit_center + Vector3(sin(a) * r, 0.0, cos(a) * r)
		m.face(rng.randf() * TAU)
		var brain := NpcBrain.new(seed_value + i * 31, rng.randf_range(0.3, 1.0), rng.randf_range(0.0, 0.8))
		brain.pit_center = pit_center
		brain.pit_radius = pit_radius
		m.brain = brain
		m.add_to_group(&"moshers")
		npcs.append(m)
	# Pit wall: two loose rows around the pit, open towards the stage.
	var placed := 0
	var row := 0
	while placed < watcher_count and row < 3:
		var radius := pit_radius + 0.75 + row * 0.7
		var n := int(TAU * radius / 0.75)
		for k in n:
			if placed >= watcher_count:
				break
			var a := TAU * k / n + row * 0.4 + rng.randf_range(-0.08, 0.08)
			var p := pit_center + Vector3(sin(a), 0.0, cos(a)) * (radius + rng.randf_range(-0.15, 0.15))
			if p.z < stage_front_z + 0.5 or absf(p.x) > 6.5 or p.z > 6.0:
				continue
			var w := Watcher.new()
			w.name = "Watcher%d" % placed
			add_child(w)
			w.setup(VARIANTS[(placed * 3 + row) % VARIANTS.size()], library, seed_value + 1000 + placed)
			w.global_position = p
			var to_pit := pit_center - p
			w.rotation.y = atan2(to_pit.x, to_pit.z)
			w.add_to_group(&"watchers")
			watchers.append(w)
			placed += 1
		row += 1
