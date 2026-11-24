extends SceneTree
## Headless test runner: godot --headless --path godot -s res://tests/run_tests.gd
## Runs every `test_*` method (-> bool, ending in `return true`) of every tests/unit/test_*.gd (a TestCase). Exit code = number of failed tests.

func _init() -> void:
	var failed := 0
	var total := 0
	var dir := DirAccess.open("res://tests/unit")
	var files := Array(dir.get_files()).filter(func(f): return f.begins_with("test_") and f.ends_with(".gd"))
	files.sort()
	for f in files:
		var script: GDScript = load("res://tests/unit/" + f)
		for m in script.get_script_method_list():
			if not String(m.name).begins_with("test_"):
				continue
			var t: TestCase = script.new()
			total += 1
			# A script error aborts the method and returns null: every test ends with `return true`.
			if t.call(m.name) != true:
				t.failures.append("aborted (script error or missing `return true`)")
			if t.failures.is_empty():
				print("  ok   %s.%s" % [f.get_basename(), m.name])
			else:
				failed += 1
				print("  FAIL %s.%s: %s" % [f.get_basename(), m.name, "; ".join(t.failures)])
	print("%d tests, %d failed" % [total, failed])
	quit(failed)
