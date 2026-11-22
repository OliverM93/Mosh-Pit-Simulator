# Changelog

Alle relevanten Änderungen an diesem Projekt. Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [SemVer](https://semver.org/lang/de/) (vor 1.0 kann sich alles ändern).

## [Unreleased]

### MOSH PIT 2.0 – Prototyp (Branch `claude/mosh-pit-2-prototype`, D-028)

- Kamera immer Richtung Band, bewegt sich nur mit dem Spieler (D-029).
- Neue Grundhaltung (Kampfhaltung aus Mocap), Fortbewegung Swagger → Run → Dash aus dem Bandai-Namco-Datensatz
  (CC BY-NC 4.0), saubere Loops; alle Moves starten/enden in der Grundhaltung → Combos gehen nahtlos ineinander.
- 2-Step und Windmill neu per IK gebaut (diagonaler Kick mit Armschwung, weite Armkreise).
- Tänzer im Pit halten Abstand zum Spieler.

- Neues Spielgefühl nach Tony Hawk's Pro Skater statt Rhythmusspiel: Momentum-Bewegung mit Kurvenradius, Skid und
  Anlauf; Third-Person-Kamera folgt der Laufrichtung.
- Hybrides Move-System: eine Taste pro Kategorie (Footwork, Arms, Kick, Acro), Richtung und Tempo wählen den Move.
  Sechs Moves: 2-Step, Windmill Arms, Spinkick, Tornado Kick (mit Anlauf), Cartwheel (seitlich), Butterfly Kick.
- Arme lassen sich über Laufen und 2-Steps legen (Ober-/Unterkörper-Animationsebenen).
- Absprung-, Flug- und Landephasen; Cancel-Fenster pro Move; Eingabepuffer.
- Combo-Timer statt fester Pause; Punkte für Clean Links, Momentum, Landungen, On Beat, Breakdowns, Layering,
  Abwechslung; Wiederholungen bringen weniger.
- Größerer Pit, Crowd-Wand als federnde Grenze; neues HUD (Combo-Kette, Timer-Balken, Move-Callouts).
- Entfernt für den Prototyp: Song-Auswahl, Free Pit, eigene Songs, Signature-Combos, Rhythmus-Bewertung, Box-Rig-Figuren.

### Geändert (Gameplay)

- Groove-Modell (D-026): Moves in natürlicher Länge, Timing nur noch Bonus, kein Sturz bei Off-Beat; Crash, wenn ein
  großer Move ins Gedränge geht. Combo-Fenster 0,8 s. HUD zeigt „ON BEAT!“ statt „MISS“; Note nach On-Beat-Anteil.

### Hinzugefügt (Grafik)

- Spieler, Publikum und Band sind jetzt echte geskinnte 3D-Figuren aus Blender (D-025/D-027): Spieler + 8
  Publikums-Varianten (Körperbau, Hautton, Bart, Kopfbedeckung, Flanell/Nadelstreifen/Band-Shirts, Camo/Jeans/
  Shorts/Trainingshose), 36 Animationen aus Motion Capture und umgerechneten Keyframe-Clips mit weichen Überblendungen;
  Schatten unter dem Pit (PS2/HD).

### Behoben

- Mocap-Retargeting: verdrehter Oberkörper (CMU-Gelenke ohne Länge, z. B. `Spine1 → Neck`), Blickrichtung um den
  doppelten Winkel gedreht (Vorzeichenfehler), Gliedmaßen im Boden (Bodenkorrektur pro Frame), Bail-Clip als
  Sprung statt Sturz.

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
