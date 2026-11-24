class_name TestCase
extends RefCounted
## Minimal assertion base for tests/run_tests.gd (no third-party test framework: zero-dependency, D-033).

var failures: Array[String] = []


func check(cond: bool, msg := "") -> void:
	if not cond:
		failures.append(msg if msg != "" else "check failed")


func eq(actual, expected, msg := "") -> void:
	if typeof(actual) == TYPE_FLOAT or typeof(expected) == TYPE_FLOAT:
		if absf(float(actual) - float(expected)) > 1e-4:
			failures.append("%s expected %s, got %s" % [msg, expected, actual])
	elif actual != expected:
		failures.append("%s expected %s, got %s" % [msg, expected, actual])


func near(actual: float, expected: float, tol: float, msg := "") -> void:
	if absf(actual - expected) > tol:
		failures.append("%s expected %s ± %s, got %s" % [msg, expected, tol, actual])
