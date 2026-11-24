class_name MoveController
extends RefCounted
## Hybrid move input → running moves on two layers (full body, upper body), with cancel windows, a 0.3 s input buffer,
## hold-to-repeat and side alternation. Port of src/gameplay/MoveController.ts with one change (D-033): a move lasts as
## long as its clip and its phases come from the clip (`clips` provides length/air per clip name).
## Pure logic: times are game seconds; nothing here touches nodes.

const BUFFER_SEC := 0.3
const LINK_SEC := 0.25
const SIDE_DEADZONE := 0.5
## Without an airborne phase the cancel window opens at this share of the move.
const DEFAULT_CANCEL := 0.7
## After landing the body needs this long to absorb the impact before the next move.
const LANDING_RECOVERY := 0.1


class Situation:
	var stick := Vector2.ZERO  ## x = right, y = forward (towards the band)
	var speed := 0.0
	var airborne := false

	static func of(stick_v: Vector2, speed_v: float, air := false) -> Situation:
		var s := Situation.new()
		s.stick = stick_v
		s.speed = speed_v
		s.airborne = air
		return s


class ActiveMove:
	var def: MoveDef
	var seq := 0
	var clip: StringName
	## Clip time the move starts at (second half of a cycle, airborne entry).
	var offset := 0.0
	var start := 0.0
	var length := 0.0
	var cancel_at := 0.0
	var repeat_at := 0.0
	var hit_at := -1.0
	var land_at := -1.0
	var mirror := false
	var linked := false
	var layered := false
	var landed := false
	var hit_done := false

	func elapsed(time: float) -> float:
		return clampf(time - start, 0.0, length)

	func progress(time: float) -> float:
		return elapsed(time) / maxf(0.001, length)

	func end_time() -> float:
		return start + length


signal move_started(move: ActiveMove)
signal move_landed(move: ActiveMove)
signal move_hit(move: ActiveMove)
signal move_ended(move: ActiveMove, cancelled: bool)

var full: ActiveMove
var upper: ActiveMove
var moves: Array[MoveDef] = []
## Object with `length(clip) -> float` and `get_info(clip)` (ClipLibrary or a test stub).
var clips: Object

var _buffer := {}
var _seq := 0
var _last_full_end := -INF
var _last_full_id: StringName
var _flip := {}


func _init(move_list: Array[MoveDef], clip_source: Object) -> void:
	moves = move_list
	clips = clip_source


func resolve(category: StringName, s: Situation) -> MoveDef:
	var side := absf(s.stick.x) > SIDE_DEADZONE and absf(s.stick.x) > absf(s.stick.y)
	var forward := s.stick.y > SIDE_DEADZONE and s.stick.y > absf(s.stick.x)
	for m in moves:
		if m.category != category:
			continue
		if (m.when_side and not side) or (m.when_forward and not forward):
			continue
		if m.when_min_speed >= 0.0 and s.speed < m.when_min_speed:
			continue
		if (m.when_airborne and not s.airborne) or (m.when_grounded and s.airborne):
			continue
		return m
	return null


func busy() -> bool:
	return full != null or upper != null


func airborne(time: float) -> bool:
	return full != null and full.land_at >= 0.0 and not full.landed and _in_air(full, time)


func press(category: StringName, time: float, s: Situation) -> void:
	if not _try_start(category, time, s):
		_buffer = {"category": category, "situation": s, "time": time}


## Held button: start the next repetition once the running one has played its motion (`repeat_at`).
func hold(category: StringName, time: float, s: Situation) -> void:
	if not _buffer.is_empty():
		return
	var def := resolve(category, s)
	if def == null or not def.repeat_on_hold:
		return
	var running := upper if def.layer == &"upper" else full
	if running != null and (running.def.category != category or running.elapsed(time) < running.repeat_at):
		return
	_try_start(category, time, s)


func update(time: float, s: Situation) -> void:
	for layer in [&"full", &"upper"]:
		var m: ActiveMove = get(layer)
		if m == null:
			continue
		if m.hit_at >= 0.0 and not m.hit_done and m.elapsed(time) >= m.hit_at:
			m.hit_done = true
			move_hit.emit(m)
		if m.land_at >= 0.0 and not m.landed and m.elapsed(time) >= m.land_at:
			m.landed = true
			move_landed.emit(m)
		if time >= m.end_time():
			_finish(layer, m.end_time(), false)
	if not _buffer.is_empty():
		if time - _buffer.time > BUFFER_SEC:
			_buffer = {}
		elif _try_start(_buffer.category, time, s, _buffer.time):
			_buffer = {}


## Something from outside takes over the body (stumble, fall): everything stops.
func interrupt(time: float) -> void:
	if full:
		_finish(&"full", time, true)
	if upper:
		_finish(&"upper", time, true)
	_buffer = {}


func reset() -> void:
	full = null
	upper = null
	_buffer = {}
	_last_full_end = -INF
	_last_full_id = &""
	_flip.clear()


# ---------------------------------------------------------------------------------------------------------------------

func _try_start(category: StringName, time: float, s: Situation, _press_time := time) -> bool:
	var def := resolve(category, s)
	if def == null:
		return true  # nothing to do – swallow the press
	if def.layer == &"upper":
		if full and full.def.category != &"footwork" and not _can_cancel(full, &"arms", time):
			return false
		if upper and not _can_cancel(upper, def.category, time):
			return false
		if full and full.def.category != &"footwork":
			_finish(&"full", time, true)
		var layered := full != null and full.def.category == &"footwork"
		var linked := upper != null
		if upper:
			_finish(&"upper", time, true)
		upper = _begin(def, time, s, linked, layered)
		return true
	var linked := time - _last_full_end <= LINK_SEC
	if full:
		if not _can_cancel(full, def.category, time):
			return false
		_finish(&"full", time, true)
		linked = true
	# Arms keep going over footwork; anything bigger takes the whole body.
	if upper and def.category != &"footwork":
		_finish(&"upper", time, true)
	var layered := def.category == &"footwork" and upper != null
	if upper and layered:
		upper.layered = true
	full = _begin(def, time, s, linked, layered)
	return true


func _can_cancel(m: ActiveMove, into: StringName, time: float) -> bool:
	return m.elapsed(time) >= m.cancel_at and m.def.cancel_into.has(into)


func _begin(def: MoveDef, time: float, s: Situation, linked: bool, layered: bool) -> ActiveMove:
	var m := ActiveMove.new()
	m.def = def
	_seq += 1
	m.seq = _seq
	m.start = time
	m.linked = linked
	m.layered = layered
	if def.alternate or def.half_cycle:
		# Alternate sides on consecutive uses of the same move.
		var prev: bool = _flip.get(def.id, false) if (def.layer == &"upper" or _last_full_id == def.id) else true
		m.mirror = not prev
		_flip[def.id] = m.mirror
	m.clip = def.clip
	if def.alternate and not def.half_cycle and clips.has_method("resolve"):
		m.clip = clips.resolve(def.clip, m.mirror)
	var length: float = clips.length(m.clip)
	var info = clips.get_info(m.clip)
	var air: Array = info.air if info != null else []
	if def.half_cycle:
		length *= 0.5
		m.offset = length if m.mirror else 0.0
	elif def.enter_at_air and s.airborne and air.size() > 0:
		m.offset = air[0][0]
		length -= m.offset
	m.length = length
	# Phases in move time (clip time minus the entry offset).
	if air.size() > 0 and not def.half_cycle:
		var land: float = air[air.size() - 1][1] - m.offset
		if land > 0.0:
			m.land_at = land
	if def.cancel_at >= 0.0:
		m.cancel_at = def.cancel_at - m.offset
	elif m.land_at >= 0.0:
		m.cancel_at = minf(length, m.land_at + LANDING_RECOVERY)
	else:
		m.cancel_at = length * DEFAULT_CANCEL
	m.repeat_at = def.repeat_at - m.offset if def.repeat_at >= 0.0 else maxf(m.cancel_at, length * 0.97)
	var clip_hit: float = info.hit_time if info != null else -1.0
	m.hit_at = (def.hit_at if def.hit_at >= 0.0 else clip_hit) - m.offset
	if def.hit_at < 0.0 and clip_hit < 0.0:
		m.hit_at = -1.0
	if def.layer == &"full":
		_last_full_id = def.id
	move_started.emit(m)
	return m


func _in_air(m: ActiveMove, time: float) -> bool:
	var info = clips.get_info(m.clip)
	if info == null or info.air.size() == 0:
		return false
	var t := m.offset + m.elapsed(time)
	for iv in info.air:
		if t >= iv[0] and t < iv[1]:
			return true
	return false


func _finish(layer: StringName, time: float, cancelled: bool) -> void:
	var m: ActiveMove = get(layer)
	if m == null:
		return
	set(layer, null)
	if layer == &"full":
		_last_full_end = time
	move_ended.emit(m, cancelled)
