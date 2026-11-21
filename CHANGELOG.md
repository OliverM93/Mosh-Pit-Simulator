# Changelog

Alle relevanten Änderungen an diesem Projekt. Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [SemVer](https://semver.org/lang/de/) (vor 1.0 kann sich alles ändern).

## [Unreleased]

### Geändert (Gameplay)

- Groove-Modell (D-026): Moves in natürlicher Länge, Timing nur noch Bonus, kein Sturz bei Off-Beat; Crash, wenn ein
  großer Move ins Gedränge geht. Combo-Fenster 0,8 s. HUD zeigt „ON BEAT!“ statt „MISS“; Note nach On-Beat-Anteil.

### Hinzugefügt (in Arbeit)

- Blender-Pipeline (headless) für echte Figuren aus MakeHuman (CC0) mit CMU-Motion-Capture; Prototyp-Modell und
  Dev-Viewer (`viewer.html`).
- Texturen für die Blender-Figuren: Positions-/Normalen-/AO-Baking in Cycles, darauf gemalte Gesichtsdetails
  (Augen mit Iris, Brauen, Lippen, Bart, Buzzcut), Jeansstoff mit Waschung, Shirt mit Print, Sneaker-Sohle.
  Kleidung wird per Schnittebenen aus dem Körper geschnitten (saubere Säume/Kragen), Gewichte vom Körper übertragen.
- Eigene Songs und Logos aus `public/user-content/` mit automatischer BPM-/Offset-Erkennung (noch ohne Doku).

### Hinzugefügt

- Grafik-Einstellung PS1 / PS2 / HD (Standard PS2): höhere interne Auflösung, ohne Vertex-Jitter, feinere Farben,
  doppelt so detaillierte Figuren; HD in nativer Auflösung ohne Retro-Filter.

### Geändert

- Charaktere komplett neu: glatt schattierte Low-Poly-Körper (verjüngte Gliedmaßen, geformter Torso, Kopf mit Kiefer
  und Hals, Fäuste, Sneaker) statt Quader; Varianten für Haare, Bart, Cap (vorwärts/rückwärts), Beanie, kurze/lange
  Ärmel.
- Crowd-Outfits aus einem Aussehens-Katalog (`src/data/appearance.ts`): fiktive Band-Shirts, Jersey, Flanell,
  Hoodie, Varsity- und Puffer-Jacke, Jeans/Camo/Cargo/Track Pants, Tattoo-Sleeves, Gesichter mit Sonnenbrille oder
  Hals-Tattoos. Per-Instanz-Texturatlas, weiterhin ein Draw Call pro Körperteil.
- Neuer Spieler-Look (MOSH-PIT-Shirt, Camo, rote Cap rückwärts); Band mit eigenen Outfits.
- Shirts und Flyer tragen Namen echter Hardcore-Bands (Text, keine Logos; D-023). Shirt-Atlanten in doppelter
  Auflösung, Brust-Prints planar projiziert und lesbar.

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
