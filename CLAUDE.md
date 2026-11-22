# CLAUDE.md – MOSH PIT

Zentrale Arbeitsanweisung für Claude Code (Opus und Sonnet). Kurz halten; Details stehen in `docs/`.
**Vor jeder Arbeit lesen:** dieses Dokument und `docs/SESSION_HANDOFF.md`.

## Spielkonzept

3D-Arcade-Moshpit-Simulator im PS1/PS2-Look. Der Spieler tanzt im Pit von Hardcore-/Beatdown-Konzerten
Moves zur Musik; Timing, flüssige Übergänge und Abwechslung ergeben Combos wie in Tony Hawk's Pro Skater.
Ziel: einfach zu lernen, hohe Skill-Ceiling, humorvoll-authentische Hardcore-Ästhetik.
Ausführlich: `docs/PROJECT_VISION.md`, `docs/GAME_DESIGN.md`.

## Technologie

- TypeScript (strict) + Three.js (einzige Laufzeit-Abhängigkeit), Vite (Dev/Build), Vitest (Tests, Node-Umgebung)
- Web Audio API (Musik und SFX prozedural synthetisiert), DOM-Overlay für UI, localStorage für Spielstände
- Node ≥ 22 (`.nvmrc`), npm (`package-lock.json` committen)

## Befehle

```bash
npm install          # Abhängigkeiten
npm run dev          # Dev-Server http://localhost:5173
npm run check        # typecheck + test + build – vor jedem Commit/PR
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run build        # Produktions-Build nach dist/
```

## Projektstruktur

```
src/core        Mathe, RNG, EventBus (keine Abhängigkeiten)
src/data        Reine Daten: moves.ts, songs/, venues.ts, comboBonuses.ts, appearance.ts (Outfits/Looks)
src/audio       SongTimeline (pur), SongClock, SongPlayer (Synth/File), instruments, Sfx, AudioEngine
src/gameplay    Headless Logik: MovementController, MoveController, ComboManager, BeatManager, HypeMeter, crowd/CrowdSim, PitSession
src/animation   pose.ts, clips.ts (Keyframe-Quelle für die Blender-Pipeline)
src/render      Three.js: Renderer, ps1.ts, textures.ts, characters (GLB), AnimationController, SkinnedCrowdRenderer, VenueBuilder, StageLights, CameraController, PlayerView, SceneView
src/input       bindings.ts (Tastenbelegung als Daten), InputManager
src/ui          Hud, Menu (Screen-Framework), screens, styles.css
src/save        SaveSystem (versioniert)
src/game        Game: Zustandsautomat + Frame-Loop, verbindet alles
tests/          Vitest, inkl. headless Komplett-Durchlauf aller Songs
docs/           Dokumentation (deutsch)
```

## Architekturprinzipien

1. **Gameplay ist headless.** `src/gameplay`, `src/audio/SongTimeline.ts`, `src/data` importieren kein Three.js und
   kein DOM. Render/Audio/UI lesen Zustand und hören auf `PitSession.events`. So bleibt alles testbar.
2. **Daten statt Code.** Neue Moves, Songs, Venues, Signature-Combos, Tastenbelegungen = Einträge in `src/data` bzw.
   `src/input/bindings.ts`. Logik nur ändern, wenn ein neues *Konzept* dazukommt.
3. **Song-Zeit ist die Wahrheit.** Timing kommt aus Song-Metadaten (`SongTimeline`), die Uhr aus dem AudioContext
   (`SongClock`). Keine Audioanalyse. Tastendrücke tragen Event-Zeitstempel, nicht Frame-Zeit.
4. **THPS statt Rhythmusspiel (D-028).** Movement, Moves, Combo, Animation und Musik sind getrennte Controller.
   Die Animation folgt der Logik (Clip-Zeit = Move-Fortschritt). Musik gibt nur Boni. Risiko ist räumlich.
5. **Tuning-Werte gebündelt:** `COMBO_TUNING`, `MOVE_TUNING`, `MOVEMENT_TUNING`, `BEAT_TUNING`, `SESSION_TUNING`,
   `CAMERA_TUNING`, `CROWD_TUNING`, `HYPE_TUNING`. Keine Magic Numbers verstreut einbauen.
6. **Keine Fremd-Assets ohne geklärte Lizenz.** Texturen/Musik/SFX sind prozedural; Figuren/Mocap: MakeHuman (CC0), CMU,
   Bandai Namco (CC BY-NC – nur nicht-kommerziell, D-029). Register in `docs/ASSET_PIPELINE.md`.
7. **Performance:** Figuren sind geskinnte Blender-Modelle (D-025/D-027) mit geteilter Geometrie/Clips; neue
   Crowd-Features dürfen keine *zusätzlichen* Draw-Calls pro NPC erzeugen. Dreiecksbudget im Blick behalten (≈ 1 Mio./Frame).
8. Keine unnötige Komplexität: jedes Feature braucht einen erkennbaren Gameplay-Nutzen.

## Coding-Konventionen

- Code, Bezeichner, Kommentare, Commit-Messages: **Englisch**. Dokumentation in `docs/`: **Deutsch**.
- 2 Spaces, LF, single quotes, Semikolons (siehe `.editorconfig`); Zeilen kurz halten (Richtwert ~140 Zeichen, Keyframe-Daten ausgenommen). Noch kein Linter – siehe Roadmap Phase 2.
- `import type` für reine Typ-Importe (`verbatimModuleSyntax`). Keine `any`.
- Kleine, fokussierte Module; öffentliche Klassen/Funktionen mit kurzem Doc-Kommentar (Warum, nicht Was).
- Neue Logik in `src/gameplay`/`src/audio` (pur) bekommt Tests in `tests/`.

## Git-Workflow

- `main` ist stabil. Nie direkt auf `main` committen oder ohne Freigabe des Owners mergen.
- Feature-Branches: `feature/<thema>`, `fix/<thema>`, `docs/<thema>`. Cloud-Sessions von Claude Code bekommen
  einen vorgegebenen Branch `claude/<name>` – dann diesen verwenden.
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`), klein und thematisch.
- Vor jedem PR: `npm run check` grün. PR-Beschreibung nach `.github/pull_request_template.md` (Änderung + Tests).
- CI (`.github/workflows/ci.yml`) prüft Typecheck, Tests, Build bei PRs und Pushes.
- Keine Secrets, keine produktiven Konfigurationen committen. Keine destruktiven Git-Aktionen ohne Rücksprache.

## Dokumentation pflegen (Pflicht)

Nach jeder größeren Aufgabe:
- `docs/SESSION_HANDOFF.md` – Stand, offene Punkte, nächster Schritt (kurz!)
- `docs/ROADMAP.md` – Häkchen setzen, neue Aufgaben/bekannte Probleme
- `docs/DECISIONS.md` – jede Architektur-/Design-Entscheidung mit Begründung und Alternativen
- `CHANGELOG.md` – unter `[Unreleased]`
- Fachdokumente (`GAME_DESIGN`, `COMBO_SYSTEM`, `AUDIO_AND_MUSIC`, `TECHNICAL_ARCHITECTURE`, …) bei Änderungen an
  den jeweiligen Systemen. Neue Abhängigkeiten in `TECHNICAL_ARCHITECTURE.md` dokumentieren.
- Nichts Wichtiges nur im Chat lassen. Keine Funktionen dokumentieren, die nicht existieren.

## Aktueller Stand (2026-11-22)

**MOSH PIT 2.0** (D-028, Branch `claude/mosh-pit-2-prototype`): THPS-artiger Prototyp – eine Location, Blender-Spieler
mit Mocap (Kampfhaltung, Pose-Matching, IK-Moves, D-029), feste Kamera Richtung Band, Momentum-Movement, sechs Moves (hybride Eingabe, Ebenen, Phasen, Cancel-Fenster),
Combo-Timer, ein Testsong. Plan/Analyse: `docs/PROTOTYPE_2.md`. Alter Stand als Referenz: `claude/laughing-bell-msxkz3`.

## Wichtige Entscheidungen (Kurzfassung, Details in `docs/DECISIONS.md`)

- TS + Three.js + Vite; Gameplay headless und getestet.
- Kein Rhythmusspiel (D-028): Musik nur als Bonus; Timing aus Song-Metadaten + AudioContext-Uhr.
- Combo-Timer wie THPS: jeder Move füllt ihn auf, leer → Combo wird kassiert; Bail verliert sie.
- Musik, SFX und Texturen prozedural – keine Lizenzrisiken.
- Noch keine Lizenzdatei (Entscheidung des Owners steht aus).

## Weiterführend

`README.md` · `CONTRIBUTING.md` · `CHANGELOG.md` · `docs/PROJECT_VISION.md` · `docs/GAME_DESIGN.md` ·
`docs/PROTOTYPE_2.md` · `docs/COMBO_SYSTEM.md` · `docs/AUDIO_AND_MUSIC.md` · `docs/TECHNICAL_ARCHITECTURE.md` · `docs/ART_DIRECTION.md` ·
`docs/ASSET_PIPELINE.md` · `docs/ROADMAP.md` · `docs/DECISIONS.md` · `docs/SESSION_HANDOFF.md`
