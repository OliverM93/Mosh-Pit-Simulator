# MOSH PIT – Hardcore Arcade Simulator

> Tony Hawk's Pro Skater – nur eben im Hardcore-Moshpit.

Ein 3D-Arcade-Spiel im PS1/PS2-Look: Du stehst im Pit eines verschwitzten Kellerclubs, tanzt zur Musik
2-Steps, Spinkicks, Cartwheels und Butterfly Kicks – im Takt, ohne Pause, ohne dich zu wiederholen. Lange,
abwechslungsreiche Combos bringen Punkte, die Crowd geht mit, und wer gegen den Beat drückt, landet auf dem
Hintern.

![Gameplay: Breakdown im Kellerclub](docs/images/gameplay-breakdown.jpg)

**Status:** Phase 1 (Core Prototype) – spielbar im Browser. Details: [docs/ROADMAP.md](docs/ROADMAP.md).

## Schnellstart

Voraussetzung: Node.js ≥ 22 (siehe `.nvmrc`).

```bash
npm install
```

```bash
npm run dev
```

Dann <http://localhost:5173> öffnen, eine Taste drücken (aktiviert Audio), **Arcade** → Song wählen.
Ins Bild klicken, um die Maus für die Kamera zu fangen.

| Befehl              | Zweck                                             |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Dev-Server mit Hot Reload                          |
| `npm run build`     | Produktions-Build nach `dist/`                     |
| `npm run preview`   | Produktions-Build lokal ausliefern                 |
| `npm run typecheck` | TypeScript-Prüfung (strict)                        |
| `npm test`          | Unit- und Integrationstests (Vitest, headless)     |
| `npm run check`     | Typecheck + Tests + Build in einem                 |

## Steuerung

| Aktion                         | Tastatur / Maus          | Gamepad              |
| ------------------------------ | ------------------------ | -------------------- |
| Bewegen                        | WASD                     | linker Stick         |
| Kamera                         | Maus (Klick = fangen)    | rechter Stick        |
| Sprint (Anlauf-Bonus)          | Shift                    | RT / LT              |
| Steps: 2-Step / Crowd Push     | Q / W+Q                  | X / ↑+X              |
| Arms: Forward / Side / Change  | E / A,D+E / S+E          | Y / ←→+Y / ↓+Y       |
| Kick: Spinkick                 | R                        | B                    |
| Floor: Floorwork / Cartwheel   | F / A,D+F                | RB / ←→+RB           |
| Sprung, in der Luft: Tornado / Butterfly | Space, dann R / F | A, dann B / RB  |
| Move-Liste ein/aus             | H                        | Back                 |
| Pause                          | Esc / P                  | Start                |

**Grundregeln:** Drücke auf den Puls (die Striche treffen sich in der Raute). Moves hintereinander erhöhen den
Multiplikator, eine kurze Pause kassiert die Combo. Wiederholungen bringen immer weniger, verschiedene
Move-Stile geben Bonus. Breakdowns und Heavy Parts verdoppeln Kicks und Air-Moves. Ein Druck gegen den Beat ist
ein **Bail** – die ganze Combo ist weg.

## Was ist drin (Phase 1)

- 3 selbst synthetisierte Platzhalter-Songs (Hardcore, Beatdown, Hardcore-Punk) mit Intro/Verse/Chorus/Breakdown/Heavy/Outro
- 11 Moves inkl. Air-Moves, beat-quantisierte Animationen mit Überblendung
- Combo-System nach THPS-Vorbild: Pool × Multiplikator, Wiederholungs-Abzug, Signature-Combos, Hype-Meter mit Frenzy
- Timing-Bewertung Perfect / Good / Okay / Miss, Beatdrop-Bonus
- Lebendige Crowd: Pit-Wand, die sich im Breakdown öffnet, 2-Stepper, Pit-Ninjas, Crowd-Surfer, Band auf der Bühne
- Venue „The Basement“ (Kellerclub), PS1-Look mit Vertex-Jitter, Dithering, Nebel, Strobo
- Modi: **Arcade** und **Free Pit**; Highscores und Einstellungen werden lokal gespeichert
- Tastatur/Maus und Gamepad

## Projektstruktur

```
src/
  core/        Mathe, RNG, EventBus
  audio/       Song-Timeline, Song-Uhr, Synth-Player, SFX
  data/        Moves, Songs, Venues, Signature-Combos (reine Daten)
  gameplay/    Headless Spiellogik: Moves, Combo, Hype, Spieler, Crowd, Session
  animation/   Posen, Keyframe-Clips, Animator
  render/      Three.js: PS1-Pipeline, Rigs, Crowd-Instancing, Venue, Licht, Kamera
  input/       Tastatur/Maus/Gamepad → abstrakte Aktionen
  ui/          HUD, Menüs (DOM-Overlay)
  save/        LocalStorage-Spielstand
  game/        Game: Zustandsautomat und Frame-Loop
tests/         Vitest (läuft ohne Browser)
docs/          Design- und Technik-Dokumentation
```

## Dokumentation

| Dokument | Inhalt |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | Zentrale Arbeitsanweisungen für Claude-Code-Sessions |
| [docs/PROJECT_VISION.md](docs/PROJECT_VISION.md) | Vision, Zielgruppe, Abgrenzung |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | Gameplay-Systeme, Moves, Crowd, Progression, Modi |
| [docs/COMBO_SYSTEM.md](docs/COMBO_SYSTEM.md) | Move-Daten, Scoring-Formel, Timing |
| [docs/AUDIO_AND_MUSIC.md](docs/AUDIO_AND_MUSIC.md) | BPM-/Beat-System, Song-Format, neue Songs |
| [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md) | Architektur, Game Loop, Systeme |
| [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) | PS1/PS2-Stil, Licht, Charaktere, UI |
| [docs/ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md) | Assets, Formate, Lizenzen |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Phasen, Stand, offene Aufgaben |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architektur- und Design-Entscheidungen |
| [docs/SESSION_HANDOFF.md](docs/SESSION_HANDOFF.md) | Übergabe zwischen Sessions |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Workflow, Konventionen |
| [CHANGELOG.md](CHANGELOG.md) | Änderungen |

## Lizenz und Inhalte

Noch keine Lizenz festgelegt – bis dahin gilt: alle Rechte vorbehalten.
Alle Musikstücke, Sounds und Texturen werden zur Laufzeit prozedural erzeugt; es sind keine Fremd-Assets
enthalten. Bands, Songs und Venues sind fiktiv. Einzige Laufzeit-Abhängigkeit: [three.js](https://threejs.org) (MIT).
