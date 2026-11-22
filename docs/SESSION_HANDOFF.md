# Session-Handoff

Kurz und praktisch. Nach jeder größeren Aufgabe aktualisieren (älteren Stand überschreiben, nicht anhängen).

## Stand: 2026-11-22 – Prototyp MOSH PIT 2.0

**Branch:** `claude/mosh-pit-2-prototype` (abgezweigt von `claude/laughing-bell-msxkz3`, der als Referenz für den
alten Stand bleibt; dessen PR gegen `main` wartet weiter auf Freigabe). Kein PR für 2.0 angelegt.

## Zuletzt erledigt

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
