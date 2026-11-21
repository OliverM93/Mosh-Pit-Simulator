# Changelog

Alle relevanten Änderungen an diesem Projekt. Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [SemVer](https://semver.org/lang/de/) (vor 1.0 kann sich alles ändern).

## [Unreleased]

## [0.1.0] – 2026-11-21 – Phase 1: Core Prototype

### Hinzugefügt

- Projekt-Setup: TypeScript (strict), Vite, Vitest, Three.js; GitHub-Actions-CI (Typecheck, Tests, Build); PR-Template.
- Dokumentation: README, CLAUDE.md, CONTRIBUTING, Roadmap, Vision, Game Design, Combo-System, Audio, Architektur,
  Art Direction, Asset-Pipeline, Entscheidungslog, Session-Handoff.
- Song-Timeline aus Metadaten (Sektionen, Half-Time-Pulse, Beatdrops) und AudioContext-basierte Song-Uhr.
- Prozeduraler Synth-Player (Drums, doppelte Distortion-Gitarren, Bass, Lead) und drei Platzhalter-Songs:
  „Basement Rules“ (Hardcore), „Spin To Win“ (Beatdown), „Matinee Mayhem“ (Hardcore-Punk).
- 11 Moves: 2-Step, Crowd Push, Forward Arms, Side Arms, Picking Up Change, Spinkick, Floorwork, Cartwheel, Hop,
  Tornado Kick, Butterfly Kick; Sprint mit Anlauf-Bonus.
- Move-System mit beat-quantisierten Längen, Input-Puffer, Cancel-Fenstern, Hop→Air-Move und Bails.
- Timing-Bewertung Perfect/Good/Okay/Miss, Combo-System (Pool × Multiplikator, Wiederholungs-Abzug, Sektions-Boni,
  Signature-Combos, Stil-Mix, Perfect-Streaks, Beatdrop-Bonus), Hype-Meter mit Pit Frenzy.
- Crowd-Simulation: atmende Pit-Wand, Dancer, Pit-Ninjas, Crowd-Surfer, Band; Reaktionen (Jubel, „Ohh“, Schubsen).
- PS1-Renderer (niedrige Auflösung, Vertex-Snapping, Dithering, Farbquantisierung), Box-Rig-Charaktere,
  instanzierte Crowd, Kellerclub-Venue, Bühnenlicht, Strobo, Lichtkegel, Rauch, Partikel.
- Third-Person-Kamera, Tastatur/Maus- und Gamepad-Steuerung über Bindings-Tabellen.
- HUD (Score, Combo, Multiplikator, Beat-Leiste, Hype, Sektion, Restzeit, Rating), Titel, Menüs, Song-Auswahl,
  Einstellungen, Pause, Ergebnisbildschirm mit Note.
- Modi Arcade und Free Pit; lokaler Spielstand (Highscores, Einstellungen, Statistik).
- 43 Tests inkl. headless Komplett-Durchlauf aller Songs.
