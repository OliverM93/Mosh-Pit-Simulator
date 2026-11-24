extends TestCase
## The clip build keeps the captured tempo and its phases (D-033) – guards against the 30→24 fps slow-down of the
## Three.js pipeline and against stretched clips.


func test_clips_are_60hz_and_in_captured_tempo() -> bool:
	var lib := ClipLibrary.shared()
	var meta: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(ClipLibrary.META)).clips
	for clip in [&"spinkick", &"tornado_kick", &"cartwheel", &"butterfly_kick"]:
		var frames: Array = meta[str(clip)].frames
		var captured: float = (frames[1] - frames[0]) / 120.0
		near(lib.length(clip), captured, 0.04, "%s length = capture" % clip)
		near(lib.library.get_animation(clip).step, 1.0 / 60.0, 1e-4, "%s 60 Hz" % clip)
	return true


func test_loops_and_root_motion_split() -> bool:
	var lib := ClipLibrary.shared()
	check(lib.get_info(&"walk").loop and lib.get_info(&"run").loop, "locomotion loops")
	near(lib.get_info(&"run").speed, 3.6, 0.3, "run speed measured from the capture")
	var spin := lib.library.get_animation(&"spinkick")
	check(spin.find_track(NodePath(ClipLibrary.ROOT_MOTION_NODE), Animation.TYPE_POSITION_3D) >= 0, "one-shots carry root motion")
	check(lib.get_info(&"spinkick").travel.length() > 0.3, "spinkick travels")
	check(lib.library.get_animation(&"walk").find_track(NodePath(ClipLibrary.ROOT_MOTION_NODE), Animation.TYPE_POSITION_3D) < 0, "loops in place")
	return true


func test_airborne_phase_measured() -> bool:
	var ci := ClipLibrary.shared().get_info(&"jump")
	check(ci.air.size() == 1, "one flight phase")
	check(ci.air_start() > 0.2 and ci.air_end() < ci.length, "takeoff and landing inside the clip")
	return true
