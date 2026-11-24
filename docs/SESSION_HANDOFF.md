# Session-Handoff

Kurz und praktisch. Nach jeder größeren Aufgabe aktualisieren (älteren Stand überschreiben, nicht anhängen).

## Stand: 2026-11-24 – Godot Vertical Slice

**Branch:** `claude/godot-migration` (von `claude/mosh-pit-2-prototype`). Godot-Projekt unter `godot/`
(Godot 4.5.1). Three.js-Stände unverändert: `claude/mosh-pit-2-prototype`, `claude/laughing-bell-msxkz3`
(PR gegen `main` wartet auf Freigabe). Kein PR für Godot angelegt.

## Zuletzt erledigt

- Owner-Vorgaben D-033 (null Budget, Godot 4.5.1, Windows, GTX-1060-Referenz, `godot/` im Repo, kein LFS,
  Timing aus Clips), Steuerungskonzept D-034 (`docs/CONTROLS.md`), Slice-Technik D-035.
- Vertical Slice gebaut und geprüft: Basement-Location, steuerbarer Spieler, 10 Pit-NPCs + 26 Zuschauer,
  CMU-Mocap im Originaltempo, Root Motion, Fuß-IK, Kontakt-Reaktionen, Schubsen, Kamera, Licht, Musik/SFX.
  Messwerte und Lücken: `docs/GODOT_MIGRATION.md` Abschnitt 13.
- 16 Unit-Tests + Smoke-Run grün (lokal und in der GitHub-CI `godot.yml`); Windows-Export gebaut, exportiertes Paket läuft headless.

## Offene Punkte

- **Owner-Test auf echter Hardware** (Gamepad + Tastatur, FPS auf GTX-1060-Klasse) – nichts davon ist in der Cloud
  prüfbar; Wine läuft hier nicht.
- Hardcore-Moves ohne freie Aufnahme: 2-Step ist Charleston-Platzhalter; Windmill, Arm Swing, Headbang fehlen.
  Weg: eigene Aufnahmen (FreeMoCap, kostenlos) oder Mixamo lokal beim Owner.
- Figuren noch MakeHuman (keine Haare/Finger) – Figuren-Upgrade ist ein eigener Block.
- Steuerung: das Umbelegungs-Menü fehlt noch (Presets „Standard“/„Klassisch“ nur per
  `input_config.gd`/`user://input.cfg`); Headbang-Taste ist belegt, aber ohne Animation.
- Gameplay-Migration (Combo, Musik-Boni, Hype, HUD, Menüs, Save) = Phase 4, erst nach Slice-Abnahme.

## Nächster empfohlener Schritt

1. Owner: Godot 4.5.1 installieren, `godot/project.godot` öffnen, F5 – Feedback zu Bewegung, Kontakten, Kamera, FPS.
2. Nach Feedback: Tuning (Reaktions-Schwellen in `mosher_reactions.gd`, `Locomotion`-Werte, Kamera) und Clip-Auswahl.

## Orientierung für die nächste Session

- Einstieg: `CLAUDE.md` → `godot/README.md` → `docs/GODOT_MIGRATION.md` (13) → `docs/DECISIONS.md` (D-033 – D-035).
- Cloud-Umgebung „Mosh-Pit-Simulator“ erlaubt `github.com` (Godot-Download). Godot nach `/opt/godot` laden,
  Windows-Templates nach `~/.local/share/godot/export_templates/4.5.1.stable/`; für Bilder `Xvfb :99` +
  `apt-get install mesa-vulkan-drivers xvfb`. Asset-Quellen (MakeHuman, CMU) per Git nach `.cache/`.
