# Session-Handoff

Kurz und praktisch. Nach jeder größeren Aufgabe aktualisieren (älteren Stand überschreiben, nicht anhängen).

## Stand: 2026-11-22 – Prototyp MOSH PIT 2.0

**Branch:** `claude/mosh-pit-2-prototype` (abgezweigt von `claude/laughing-bell-msxkz3`, der als Referenz für den
alten Stand bleibt; dessen PR gegen `main` wartet weiter auf Freigabe). Kein PR für 2.0 angelegt.

## Zuletzt erledigt

- **D-031:** 2-Step aus dem Referenzvideo des Owners per MediaPipe-Video-Mocap (`tools/blender/videomocap.py`,
  Daten `tools/blender/video/two_step_pose.json`). Weitere Moves lassen sich genauso aus Videos gewinnen.

- **D-030:** Arm Swing + Windmill (vorwärts) neu, 2-Step mit kreuzendem Bein, Halten = Rhythmus, frühere
  Cancel-Fenster, alle Clips auf den Boden gesetzt (NPCs versinken nicht mehr). 7 Moves, 43 Tests.

- **Owner-Feedback umgesetzt (D-029):** feste Kamera Richtung Band; Animationen neu: Kampfhaltung + Swagger/Run/Dash
  (Bandai-Mocap, CC BY-NC), Pose-Matching aller Moves auf die Grundhaltung, 2-Step/Windmill per IK
  (`tools/blender/authoring.py`), Locomotion-Mischung über vier Stufen. Viewer: `viewer.html?clip=two_step&cam=back`.

- Konzept „MOSH PIT 2.0“ (Owner) analysiert, Plan in `docs/PROTOTYPE_2.md`, Entscheidung D-028.
- Neu gebaut: `MovementController`, `MoveController`, `ComboManager`, `BeatManager`, `PitSession`,
  `AnimationController` (Ebenen), `PlayerView`, Chase-`CameraController`, HUD, Menüs (nur ein Testsong).
- Entfernt: Rhythmus-Bewertung, alte Move-/Combo-Systeme, Modi/Song-Auswahl, eigene Songs (Loader), Box-Rig-Figuren.
- Verifiziert: `npm run check` grün (42 Tests), Browser-Durchlauf (Headless, deterministischer Bot) ohne Fehler:
  Sprint, Spinkick, 2-Step + Windmill (LAYERED), Cartwheel, Butterfly Kick, Combo-Timer und Banken.

## Offene Probleme

- Nicht auf echter GPU/mit echtem Gamepad gespielt – Steuerungsgefühl ist ungetunt (Startwerte).
- Grafik noch nicht auf THUG2-/Def-Jam-Niveau (Haare, Kleidungsdetails, Venue, Licht) – nächster großer Block.
- Kein Aufsteh-Clip nach Bail; Cartwheel-Richtung des Mocap-Clips nicht gegen die Laufrichtung geprüft.
- Bandai-Clips sind nur nicht-kommerziell lizenziert (CC BY-NC) – vor kommerzieller Nutzung ersetzen.
- Grundhaltung hält die Fäuste recht hoch (Boxer-Deckung) – ggf. per IK absenken, wenn der Owner es anders will.
- Testsong ist der Synth-Platzhalter „Basement Rules“.

## Nächster empfohlener Schritt

1. Owner spielt an: `git fetch && git checkout claude/mosh-pit-2-prototype && npm install && npm run dev`.
2. Tuning nach Feedback (`MOVEMENT_TUNING`, `CAMERA_TUNING`, `COMBO_TUNING`, Move-Daten).
3. Grafik-Block (PROTOTYPE_2.md, Schritt 6).

## Orientierung für die nächste Session

- Einstieg: `CLAUDE.md` → `docs/PROTOTYPE_2.md` → `src/gameplay/PitSession.ts`.
- Moves: `src/data/moves.ts`; Scoring: `COMBO_TUNING` in `ComboManager.ts`; Bewegung: `MOVEMENT_TUNING`.
- Browser-Debug: `window.moshpit` (Game). Für deterministische Tests `moshpit.state = 'debug'` setzen und
  `moshpit.session.update(...)` / `moshpit.view.update(...)` selbst aufrufen (die Schleife rendert dann nur).
