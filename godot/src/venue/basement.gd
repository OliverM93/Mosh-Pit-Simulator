class_name Basement
extends Node3D
## "The Basement" (venues.ts): sweaty cellar club. Low ceiling with pipes, brick walls, concrete floor, a small wooden
## stage with amps and a drum riser, a truss with coloured spots that cut through haze (volumetric fog), one bare bulb
## over the pit. Built in code from a few dimensions so the room can be tuned as data.

const ROOM := Vector3(14.0, 3.7, 13.0)  ## width, height, depth (x: -7..7, z: -6.5..6.5)
const STAGE := {"width": 8.0, "depth": 2.4, "height": 0.5}
const PIT_CENTER := Vector3(0.0, 0.0, 0.6)
const PIT_RADIUS := 3.4
const STAGE_COLORS := [Color(1.0, 0.16, 0.2), Color(0.25, 0.4, 1.0), Color(1.0, 0.6, 0.15), Color(0.6, 0.2, 1.0)]
const POSTERS := ["AGNOSTIC FRONT", "CRO-MAGS", "BIOHAZARD", "COMEBACK KID", "KUBLAI KHAN", "TERROR"]

var spots: Array[SpotLight3D] = []
var bulb: OmniLight3D
var _t := 0.0


func _ready() -> void:
	_environment()
	_room()
	_stage()
	_lights()
	_decor()


func stage_front_z() -> float:
	return -ROOM.z * 0.5 + STAGE.depth


func _process(delta: float) -> void:
	_t += delta
	# Slow sweeping spots; the bulb flickers a little.
	for i in spots.size():
		var s := spots[i]
		s.rotation.y = PI + sin(_t * (0.35 + i * 0.07) + i) * 0.35
		s.rotation.x = deg_to_rad(-58.0) + sin(_t * 0.5 + i * 1.7) * 0.12
	if bulb:
		bulb.light_energy = 2.4 + sin(_t * 23.0) * 0.04 + (0.25 if fmod(_t, 7.3) < 0.06 else 0.0)


func _environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.02, 0.015, 0.025)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.32, 0.25, 0.4)
	env.ambient_light_energy = 0.6
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.tonemap_exposure = 1.1
	env.glow_enabled = true
	env.glow_intensity = 0.6
	env.glow_bloom = 0.08
	env.glow_hdr_threshold = 1.2
	env.ssao_enabled = true
	env.ssao_radius = 0.8
	env.ssao_intensity = 1.6
	env.volumetric_fog_enabled = true
	env.volumetric_fog_density = 0.045
	env.volumetric_fog_albedo = Color(0.85, 0.8, 0.9)
	env.volumetric_fog_ambient_inject = 0.15
	env.volumetric_fog_length = 24.0
	env.adjustment_enabled = true
	env.adjustment_saturation = 1.1
	env.adjustment_contrast = 1.05
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)


func _room() -> void:
	var hx := ROOM.x * 0.5
	var hz := ROOM.z * 0.5
	_box(Vector3(0, -0.1, 0), Vector3(ROOM.x, 0.2, ROOM.z), Surfaces.concrete(), true)
	_box(Vector3(0, ROOM.y + 0.1, 0), Vector3(ROOM.x, 0.2, ROOM.z), Surfaces.concrete(), false)
	_box(Vector3(-hx - 0.1, ROOM.y * 0.5, 0), Vector3(0.2, ROOM.y, ROOM.z), Surfaces.brick(), true)
	_box(Vector3(hx + 0.1, ROOM.y * 0.5, 0), Vector3(0.2, ROOM.y, ROOM.z), Surfaces.brick(), true)
	_box(Vector3(0, ROOM.y * 0.5, -hz - 0.1), Vector3(ROOM.x, ROOM.y, 0.2), Surfaces.brick(), true)
	_box(Vector3(0, ROOM.y * 0.5, hz + 0.1), Vector3(ROOM.x, ROOM.y, 0.2), Surfaces.brick(), true)
	# Pipes and a duct under the ceiling.
	var pipe := Surfaces.flat(Color(0.32, 0.3, 0.28), 0.45, 0.6)
	for i in 3:
		var m := MeshInstance3D.new()
		var c := CylinderMesh.new()
		c.top_radius = 0.07 + i * 0.02
		c.bottom_radius = c.top_radius
		c.height = ROOM.z
		m.mesh = c
		m.material_override = pipe
		m.rotation.x = PI * 0.5
		m.position = Vector3(-4.5 + i * 0.35, ROOM.y - 0.25 - i * 0.06, 0)
		add_child(m)
	_box(Vector3(4.2, ROOM.y - 0.3, 0.5), Vector3(0.9, 0.4, ROOM.z - 1.0), Surfaces.flat(Color(0.4, 0.4, 0.42), 0.35, 0.8), false)


func _stage() -> void:
	var z0 := -ROOM.z * 0.5
	var h: float = STAGE.height
	_box(Vector3(0, h * 0.5, z0 + STAGE.depth * 0.5), Vector3(STAGE.width, h, STAGE.depth), Surfaces.planks(), true)
	# Yellow tape on the edge.
	_box(Vector3(0, h + 0.002, z0 + STAGE.depth - 0.04), Vector3(STAGE.width, 0.004, 0.06), Surfaces.flat(Color(0.9, 0.75, 0.1), 0.6), false)
	var grill := Surfaces.flat(Color(0.05, 0.05, 0.055), 0.95)
	var cab := Surfaces.flat(Color(0.02, 0.02, 0.02), 0.6)
	for side in [-1, 1]:
		for k in 2:
			var x: float = side * (2.9 - k * 0.8)
			_box(Vector3(x, h + 0.62, z0 + 0.55), Vector3(0.75, 1.24, 0.42), cab, true)
			_box(Vector3(x, h + 0.62, z0 + 0.765), Vector3(0.68, 1.12, 0.01), grill, false)
		_box(Vector3(side * 2.9, h + 1.45, z0 + 0.55), Vector3(0.75, 0.42, 0.42), cab, true)
		# Monitors at the front edge.
		var mon := _box(Vector3(side * 1.6, h + 0.18, z0 + STAGE.depth - 0.35), Vector3(0.6, 0.36, 0.45), cab, false)
		mon.rotation.x = -0.35
	# Drum riser.
	_box(Vector3(0, h + 0.15, z0 + 0.8), Vector3(2.2, 0.3, 1.4), Surfaces.flat(Color(0.08, 0.08, 0.09), 0.8), true)
	var shell := Surfaces.flat(Color(0.55, 0.05, 0.08), 0.3, 0.3)
	for d in [[0.0, 0.62, 0.32, 0.5], [-0.55, 0.62, 0.2, 0.35], [0.55, 0.62, 0.2, 0.35]]:
		var m := MeshInstance3D.new()
		var c := CylinderMesh.new()
		c.top_radius = d[2]
		c.bottom_radius = d[2]
		c.height = d[3]
		m.mesh = c
		m.material_override = shell
		m.position = Vector3(d[0], h + 0.3 + d[1] * 0.5, z0 + 0.95)
		if d[0] == 0.0:
			m.rotation.x = PI * 0.5
		add_child(m)
	# Backdrop banner (the band on stage is fictional while the music is synthesized, D-023).
	var banner := _box(Vector3(0, 2.4, z0 + 0.03), Vector3(5.5, 1.3, 0.02), Surfaces.flat(Color(0.03, 0.03, 0.035), 0.9), false)
	var label := Label3D.new()
	label.text = "CONCRETE HALO"
	label.font_size = 160
	label.outline_size = 0
	label.modulate = Color(0.85, 0.82, 0.75)
	label.position = Vector3(0, 0, 0.02)
	label.pixel_size = 0.004
	label.shaded = true
	banner.add_child(label)


func _lights() -> void:
	var z0 := -ROOM.z * 0.5
	# Truss over the stage front.
	_box(Vector3(0, ROOM.y - 0.35, z0 + STAGE.depth + 0.2), Vector3(STAGE.width + 1.0, 0.12, 0.12), Surfaces.flat(Color(0.1, 0.1, 0.1), 0.4, 0.8), false)
	for i in 4:
		var s := SpotLight3D.new()
		s.light_color = STAGE_COLORS[i]
		s.light_energy = 14.0
		s.spot_range = 11.0
		s.spot_angle = 20.0
		s.spot_attenuation = 1.2
		s.light_volumetric_fog_energy = 2.5
		s.shadow_enabled = i == 1 or i == 2
		s.position = Vector3(-3.0 + i * 2.0, ROOM.y - 0.45, z0 + STAGE.depth + 0.2)
		s.rotation = Vector3(deg_to_rad(-58.0), PI, 0.0)
		add_child(s)
		spots.append(s)
		var can := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 0.1
		cm.bottom_radius = 0.13
		cm.height = 0.25
		can.mesh = cm
		can.material_override = Surfaces.flat(Color(0.05, 0.05, 0.05), 0.5, 0.5)
		can.position = s.position + Vector3(0, 0.1, 0)
		add_child(can)
	# Stage wash from behind the band.
	var back := OmniLight3D.new()
	back.light_color = Color(0.5, 0.15, 0.9)
	back.light_energy = 2.0
	back.omni_range = 6.0
	back.position = Vector3(0, 2.6, z0 + 0.6)
	add_child(back)
	# The bare bulb over the pit: warm key light with real shadows.
	bulb = OmniLight3D.new()
	bulb.light_color = Color(1.0, 0.78, 0.5)
	bulb.light_energy = 2.4
	bulb.omni_range = 8.0
	bulb.shadow_enabled = true
	bulb.light_volumetric_fog_energy = 0.6
	bulb.position = PIT_CENTER + Vector3(0, ROOM.y - 0.5, 0)
	add_child(bulb)
	var glass := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.06
	sm.height = 0.12
	glass.mesh = sm
	glass.material_override = Surfaces.emissive(Color(1.0, 0.8, 0.5), 6.0)
	glass.position = bulb.position + Vector3(0, 0.08, 0)
	glass.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(glass)
	# Exit sign.
	var exit_sign := _box(Vector3(5.5, 2.7, ROOM.z * 0.5 - 0.02), Vector3(0.6, 0.22, 0.04), Surfaces.emissive(Color(0.1, 1.0, 0.3), 3.0), false)
	exit_sign.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _decor() -> void:
	var paper := Surfaces.flat(Color(0.78, 0.76, 0.7), 0.95)
	var rng := RandomNumberGenerator.new()
	rng.seed = 42
	for i in POSTERS.size():
		var left := i % 2 == 0
		var x := -ROOM.x * 0.5 + 0.01 if left else ROOM.x * 0.5 - 0.01
		var z := -2.5 + (i / 2) * 2.6 + rng.randf_range(-0.4, 0.4)
		var poster := _box(Vector3(x, 1.7 + rng.randf_range(-0.2, 0.3), z), Vector3(0.005, 0.6, 0.42), paper, false)
		poster.rotation.x = rng.randf_range(-0.08, 0.08)
		var l := Label3D.new()
		l.text = POSTERS[i].replace(" ", "\n")
		l.font_size = 64
		l.pixel_size = 0.0025
		l.modulate = Color(0.08, 0.06, 0.05)
		l.outline_size = 0
		l.shaded = true
		l.rotation.y = PI * 0.5 if left else -PI * 0.5
		l.position = Vector3(0.01 if left else -0.01, 0.05, 0)
		poster.add_child(l)
	# Merch table at the back.
	_box(Vector3(-4.0, 0.4, ROOM.z * 0.5 - 0.6), Vector3(2.0, 0.8, 0.7), Surfaces.flat(Color(0.12, 0.1, 0.08), 0.7), true)


func _box(pos: Vector3, size: Vector3, mat: Material, collide: bool) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = size
	m.mesh = b
	m.material_override = mat
	m.position = pos
	add_child(m)
	if collide:
		var body := StaticBody3D.new()
		body.collision_layer = 1
		var shape := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = size
		shape.shape = bs
		body.add_child(shape)
		m.add_child(body)
	return m
