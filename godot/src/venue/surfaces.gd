class_name Surfaces
extends RefCounted
## Procedural PBR materials for the venue (zero budget, D-033): albedo + height drawn into images, normal maps derived
## from the height. Built once at startup and cached; no texture files to license.

static var _cache := {}


static func concrete() -> StandardMaterial3D:
	return _cached("concrete", func():
		var noise := FastNoiseLite.new()
		noise.seed = 7
		noise.frequency = 0.02
		noise.fractal_octaves = 5
		var stains := FastNoiseLite.new()
		stains.seed = 3
		stains.frequency = 0.004
		var size := 512
		var albedo := Image.create(size, size, false, Image.FORMAT_RGB8)
		var height := Image.create(size, size, false, Image.FORMAT_RGB8)
		for y in size:
			for x in size:
				var n := noise.get_noise_2d(x, y) * 0.5 + 0.5
				var st := clampf(stains.get_noise_2d(x, y) * 1.4, 0.0, 1.0)
				var g := 0.20 + n * 0.10 - st * 0.08
				albedo.set_pixel(x, y, Color(g * 1.02, g, g * 0.97))
				height.set_pixel(x, y, Color(n, n, n))
		return _material(albedo, height, 0.82, 4.0, 2.0))


static func brick() -> StandardMaterial3D:
	return _cached("brick", func():
		var noise := FastNoiseLite.new()
		noise.seed = 11
		noise.frequency = 0.08
		var size := 512
		var bw := 64
		var bh := 24
		var albedo := Image.create(size, size, false, Image.FORMAT_RGB8)
		var height := Image.create(size, size, false, Image.FORMAT_RGB8)
		var rng := RandomNumberGenerator.new()
		rng.seed = 5
		var tints := {}
		for y in size:
			var row := y / bh
			var shift := (bw / 2) if row % 2 == 1 else 0
			for x in size:
				var col := (x + shift) / bw
				var key := row * 100 + col
				if not tints.has(key):
					tints[key] = rng.randf_range(-0.05, 0.05)
				var mortar := (y % bh) < 3 or ((x + shift) % bw) < 3
				var n := noise.get_noise_2d(x, y) * 0.5 + 0.5
				if mortar:
					var m := 0.16 + n * 0.04
					albedo.set_pixel(x, y, Color(m, m * 0.97, m * 0.93))
					height.set_pixel(x, y, Color(0.1, 0.1, 0.1))
				else:
					var t: float = tints[key]
					albedo.set_pixel(x, y, Color(0.30 + t + n * 0.06, 0.12 + t * 0.6 + n * 0.03, 0.09 + n * 0.02))
					var h := 0.7 + n * 0.3
					height.set_pixel(x, y, Color(h, h, h))
		return _material(albedo, height, 0.9, 6.0, 3.0))


static func planks() -> StandardMaterial3D:
	return _cached("planks", func():
		var noise := FastNoiseLite.new()
		noise.seed = 21
		noise.frequency = 0.01
		var size := 256
		var albedo := Image.create(size, size, false, Image.FORMAT_RGB8)
		var height := Image.create(size, size, false, Image.FORMAT_RGB8)
		for y in size:
			for x in size:
				var gap := (x % 32) < 2
				var grain := noise.get_noise_2d(x * 6.0, y * 0.5) * 0.5 + 0.5
				var c := Color(0.16 + grain * 0.07, 0.10 + grain * 0.04, 0.06 + grain * 0.02)
				albedo.set_pixel(x, y, c.darkened(0.6) if gap else c)
				var h := 0.1 if gap else 0.6 + grain * 0.4
				height.set_pixel(x, y, Color(h, h, h))
		return _material(albedo, height, 0.7, 3.0, 2.0))


static func flat(color: Color, roughness := 0.8, metallic := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = roughness
	m.metallic = metallic
	return m


static func emissive(color: Color, energy := 2.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.emission_enabled = true
	m.emission = color
	m.emission_energy_multiplier = energy
	return m


static func _cached(key: String, build: Callable) -> StandardMaterial3D:
	if not _cache.has(key):
		_cache[key] = build.call()
	return _cache[key]


static func _material(albedo: Image, height: Image, roughness: float, normal_strength: float, uv: float) -> StandardMaterial3D:
	albedo.generate_mipmaps()
	var normal := height.duplicate() as Image
	normal.bump_map_to_normal_map(normal_strength)
	normal.generate_mipmaps()
	var m := StandardMaterial3D.new()
	m.albedo_texture = ImageTexture.create_from_image(albedo)
	m.normal_enabled = true
	m.normal_texture = ImageTexture.create_from_image(normal)
	m.roughness = roughness
	m.uv1_triplanar = true
	m.uv1_scale = Vector3.ONE * (1.0 / uv)
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	return m
