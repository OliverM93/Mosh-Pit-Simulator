# MOSH PIT – Godot-Projekt (Vertical Slice)

Godot **4.5.1-stable** (D-033), GDScript, Zielplattform Windows-PC. Analyse und Plan: [`docs/GODOT_MIGRATION.md`](../docs/GODOT_MIGRATION.md),
Steuerung: [`docs/CONTROLS.md`](../docs/CONTROLS.md). Das Three.js-Projekt im Repo-Root bleibt unverändert als Referenz.

## Starten

1. Godot 4.5.1 (Standard, nicht .NET) von godotengine.org laden – kostenlos, MIT-Lizenz.
2. Godot öffnen → *Importieren* → `godot/project.godot` → *Ausführen* (F5).
   Beim ersten Öffnen importiert Godot die Assets (einige Sekunden).
3. Steuerung (Gamepad oder Tastatur, Details in `docs/CONTROLS.md`):

| Aktion | Gamepad | Tastatur |
| --- | --- | --- |
| Bewegen | linker Stick | WASD |
| Sprint | RT | Shift |
| Springen / Akro (mit Stick seitlich: Rad) | A | Leertaste |
| 2-Step (halten = weiter) | X | J |
| Kick (in der Luft: Butterfly, mit Anlauf: Tornado) | B | L |
| Schubsen | RB | O |
| Ausweichen | LB | U |
| Umschauen / Kamera nah-weit | rechter Stick / R3 | rechte Maustaste + Maus / V |

Die Belegung „Klassisch“ (Q/E/R wie im 2.0-Prototyp) ist als Preset vorhanden (`src/input/input_config.gd`).

## Prüfen (headless, auch in CI)

```bash
godot --headless --path godot --import                                  # Assets importieren, Klassen registrieren
godot --headless --path godot -s res://tests/run_tests.gd               # Unit-Tests
godot --headless --path godot --fixed-fps 60 -s res://tests/smoke_main.gd   # 15-s-Durchlauf der Szene mit Bot-Eingaben
godot --headless --path godot --fixed-fps 60 -s res://tools/dev/foot_slide.gd   # Fußrutschen messen
godot --headless --path godot --fixed-fps 60 -s res://tools/dev/perf.gd -- 10 26 # CPU-Kosten pro Frame
godot --headless --path godot --export-release "Windows Desktop" build/windows/MoshPit.exe
```

Bilder ohne Monitor (Software-Vulkan): `Xvfb :99 &` und `DISPLAY=:99 godot --path godot … -s res://tools/dev/capture.gd`
(gescripteter Spielablauf mit Screenshots) bzw. `tools/dev/clip_sheet.gd` (Posen-Reihen je Clip auf der Spielfigur).

## Aufbau

```
project.godot          Engine-Einstellungen (Forward+, Jolt-Physik, 60 Hz)
scenes/main.tscn       Einstieg → src/main.gd baut den Slice zusammen
src/anim               ClipLibrary (Mocap → AnimationLibrary, Root Motion), MosherAnimator (AnimationTree), FootLock (Fuß-IK)
src/characters         Mosher (gemeinsamer Körper für Spieler + NPCs), MosherReactions, brains/ (Player, NPC)
src/gameplay           MoveController, MoveDef, Locomotion – reine Logik, getestet
src/data               moves.gd (Move-Daten)
src/crowd              CrowdDirector (Tiers), Watcher (Pit-Wand)
src/venue              Basement (Raum, Bühne, Licht), Surfaces (prozedurale PBR-Materialien)
src/camera, src/ui, src/input, src/audio
assets/                Figuren (GLB), Animationen (anims.glb + Meta), Audio (OGG)
tools/anim             Blender-Build der Clips aus CMU-Mocap (+ Vorschau-Werkzeuge)
tools/audio            Offline-Render von Song und SFX aus dem vorhandenen Web-Audio-Synth
tools/dev              Mess- und Prüfwerkzeuge
tests/                 Test-Runner (ohne Fremd-Framework) + Unit-Tests + Smoke-Run
```

## Assets neu bauen

- Animationen: `.cache/blender-venv/bin/python godot/tools/anim/build_anims.py --mh .cache/mh/makehuman/data --cmu .cache/cmu/data --out godot/assets/animations/anims.glb`
  (Quellen-Setup wie in `tools/blender/README.md`; danach in Godot neu importieren).
- Figuren: Kopie der Three.js-Figuren (`public/models/char_*.glb`), Texturen mit `tools/assets/fix_glb_textures.py`
  neu kodiert (Godot 4.5 lehnt Blenders JPEGs ab).
- Audio: `node godot/tools/audio/render_audio.mjs` (Chromium + ffmpeg).

Lizenzen und Herkunft: `docs/ASSET_PIPELINE.md` (Abschnitt Godot).
