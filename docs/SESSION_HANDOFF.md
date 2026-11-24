# Session-Handoff

Kurz und praktisch. Nach jeder größeren Aufgabe aktualisieren (älteren Stand überschreiben, nicht anhängen).

## Stand: 2026-11-24 – Godot-Migration: Analyse und Plan

**Branch:** `claude/godot-migration` (abgezweigt von `claude/mosh-pit-2-prototype`). Nur Dokumentation geändert,
kein Code. Three.js-Stände bleiben unverändert: `claude/mosh-pit-2-prototype` (2.0-Prototyp),
`claude/laughing-bell-msxkz3` (Phase 1, PR gegen `main` wartet auf Freigabe). Kein PR angelegt.

## Zuletzt erledigt

- Owner ordnet Neuentwicklung in Godot 4.x + GDScript an (D-032). Erster Auftrag: Analyse + Plan, keine Migration.
- `docs/GODOT_MIGRATION.md`: Bestandsaufnahme, Systemmatrix (übernehmen/anpassen/neu/entfällt), Ursachen der
  Animationsprobleme mit Messwerten, Godot-Architektur, Animations-/Crowd-/Steuerungskonzept, Asset-Reuse,
  Plan mit Gates A–D, Risiken, offene Entscheidungen.
- Zuvor (2.0-Prototyp): 2-Step aus zwei Referenzvideos (D-031) – vom Owner weiterhin als unzureichend bewertet.

## Offene Punkte

- **Owner-Entscheidungen** (GODOT_MIGRATION.md, Abschnitt 12): Animationsquelle, Figuren-Weg, Godot-Version und
  Plattform, Netzwerkfreigabe für Godot in der Cloud, Interaktions-Eingabe, Timing-Prinzip, Referenz-Hardware, Repo.
- Godot ist in der Cloud-Umgebung nicht installierbar: github.com wird vom Proxy blockiert (403), Godot ist auch
  nicht über PyPI, npm oder apt verfügbar – Freigabe nötig, bevor Claude headless importieren/testen kann.
- Bekannter Exportfehler der Blender-Pipeline: retargetete Clips laufen 25 % zu langsam (30-Hz-Keys auf 24-fps-
  Frames, `retarget.py`/`write_action`). Im Three.js-Stand bewusst nicht korrigiert (keine Änderungen dort).

## Nächster empfohlener Schritt

1. Owner beantwortet Abschnitt 12.
2. Phase 0: Godot-Version pinnen, Binary verfügbar machen, Projekt-Skelett `godot/`, Test-Framework, CI.
3. Gate A (Bewegung) mit neuen Animationen – der eigentliche Qualitätsbeweis.

## Orientierung für die nächste Session

- Einstieg: `CLAUDE.md` → `docs/GODOT_MIGRATION.md` → `docs/DECISIONS.md` (D-032, D-028, D-029).
- Spiellogik als Port-Vorlage: `src/gameplay/` (+ `tests/` als Spezifikation), Daten: `src/data/`.
