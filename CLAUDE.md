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
src/gameplay    Headless Logik: MoveSystem, MoveResolver, ComboSystem, HypeMeter, Player, crowd/CrowdSim, PitSession, modes
src/animation   pose.ts (Pose-Format), clips.ts (Keyframes), Animator (Überblendung)
src/render      Three.js: Renderer (PS1-Post), ps1.ts, textures.ts, CharacterRig, CrowdRenderer, VenueBuilder, StageLights, CameraController, PlayerView, SceneView
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
4. **Groove-Modell (D-026).** Moves laufen in natürlicher Länge; Timing zum Beat ist nur Bonus. Risiko ist
   räumlich (Crash bei großen Moves ins Gedränge), nicht rhythmisch.
5. **Tuning-Werte gebündelt:** `SCORING` (ComboSystem), `MOVE_TUNING`, `SESSION_TUNING`, `PLAYER_TUNING`,
   `CROWD_TUNING`, `HYPE_TUNING`, `TIMING_WINDOWS`. Keine Magic Numbers verstreut einbauen.
6. **Keine Fremd-Assets ohne geklärte Lizenz.** Texturen/Musik/SFX sind prozedural (siehe `docs/ASSET_PIPELINE.md`).
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

## Aktueller Stand (2026-11-21)

Phase 1 abgeschlossen; Phase 2 (Gameplay Polish) läuft: Groove-Modell (D-026), echte geskinnte Blender-Figuren mit
Motion Capture für Spieler/Crowd/Band (D-025/D-027, `tools/blender/`, `public/models/`), Grafikstufen PS1/PS2/HD.
Ein Venue, drei Synth-Songs (Originalmusik folgt), 11 Moves, 56 Tests. Siehe `docs/ROADMAP.md` und `docs/SESSION_HANDOFF.md`.

## Wichtige Entscheidungen (Kurzfassung, Details in `docs/DECISIONS.md`)

- TS + Three.js + Vite; Gameplay headless und getestet.
- Timing aus Song-Metadaten + AudioContext-Uhr; Timing nur als Bonus, Crash statt Miss-Bail (D-026).
- Combo wird nach einer kurzen Pause (Chain Window) kassiert, nicht beim Landen.
- Musik, SFX und Texturen prozedural – keine Lizenzrisiken.
- Noch keine Lizenzdatei (Entscheidung des Owners steht aus).

## Weiterführend

`README.md` · `CONTRIBUTING.md` · `CHANGELOG.md` · `docs/PROJECT_VISION.md` · `docs/GAME_DESIGN.md` ·
`docs/COMBO_SYSTEM.md` · `docs/AUDIO_AND_MUSIC.md` · `docs/TECHNICAL_ARCHITECTURE.md` · `docs/ART_DIRECTION.md` ·
`docs/ASSET_PIPELINE.md` · `docs/ROADMAP.md` · `docs/DECISIONS.md` · `docs/SESSION_HANDOFF.md`
