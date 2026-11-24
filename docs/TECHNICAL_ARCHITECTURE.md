# Technische Architektur

> **Godot-Neuentwicklung (D-032 – D-035):** Dieses Dokument beschreibt das Three.js-Projekt (Referenz). Die
> Architektur des Godot-Projekts steht in `docs/GODOT_MIGRATION.md` (Abschnitte 6–8, 13) und `godot/README.md`.
> Abhängigkeiten dort: Godot 4.5.1 (MIT) als Engine; Werkzeuge Blender/bpy (GPL), MakeHuman-Daten (CC0), CMU-Mocap,
> Playwright/Chromium + ffmpeg nur für den Audio-Render. Keine Godot-Plugins.

## Technologien und Abhängigkeiten

| Paket | Version | Zweck | Art |
| --- | --- | --- | --- |
| `three` | ^0.187 | 3D-Rendering (WebGLRenderer) | Laufzeit (MIT) |
| `typescript` | ^7.0 | Typprüfung (`tsc --noEmit`, strict) | Dev |
| `vite` | ^8.3 | Dev-Server, Produktions-Build | Dev |
| `vitest` | ^5.1 | Tests in Node-Umgebung | Dev |
| `@types/three` | ^0.187 | Typen | Dev |

Browser-APIs: WebGL 2, Web Audio, Gamepad API, Pointer Lock, localStorage. Node ≥ 22 für Tooling.
**Neue Abhängigkeiten** hier mit Begründung eintragen und in `docs/DECISIONS.md` festhalten.

## Schichten und Verantwortlichkeiten

```
                ┌──────────────────────── src/game/Game.ts ────────────────────────┐
                │ Zustandsautomat · Frame-Loop · verbindet alle Schichten           │
                └───┬───────────┬──────────────┬───────────────┬──────────────┬─────┘
                    │           │              │               │              │
              src/input    src/gameplay    src/audio       src/render      src/ui
              (Geräte →    (headless,      (Uhr, Synth,    (Three.js,      (DOM-HUD,
               Aktionen)    getestet)       SFX)            PS1-Look)       Menüs)
                                │  ▲            ▲                ▲              ▲
                                │  └── src/data (Moves, Songs, Venues, Combos) ─┘
                                └── events (EventBus) ──► Audio / Render / UI hören zu
```

| Modul | Verantwortung | Darf importieren |
| --- | --- | --- |
| `core` | Mathe, RNG, EventBus | nichts |
| `data` | Inhalte als Daten | Typen aus gameplay/audio |
| `audio/SongTimeline`, `songTypes` | Zeitrechnung Song ↔ Beats/Pulse/Sektionen | core |
| `gameplay` | Spiellogik, Physik, Crowd-Verhalten | core, data, SongTimeline |
| `animation` | Posen, Clips, Überblendung (pure Arrays) | – |
| `audio` (Rest) | AudioContext, Uhr, Wiedergabe, SFX | gameplay-Typen |
| `render` | Three.js-Szene, liest Session-Zustand | three, gameplay, animation |
| `input` | Tastatur/Maus/Gamepad → `ButtonAction`s | – |
| `ui` | HUD/Menüs als DOM | gameplay, data |
| `save` | Persistenz | – |
| `game` | Orchestrierung | alles |

**Regel:** `gameplay`, `data`, `SongTimeline` und `animation` sind frei von Three.js und DOM → in Vitest testbar.

## Zentrale Datenstrukturen

- `SongDefinition` → `SongTimeline` (`ResolvedSection`, `ResolvedEvent`, `PulseInfo`) – siehe AUDIO_AND_MUSIC.md
- `MoveDefinition` (Daten: Kategorie, Ebene, Dauer, Clip-Ausschnitt, Phasen, Cancel-Fenster, Bewegungseinfluss)
  → `ActiveMove` (Start/Ende, Spiegelung, linked/layered/landed)
- `ComboManager` (Basis, Multiplikator, Timer, Einträge mit Tags) → `BankResult`, `ComboStats`
- `CrowdAgent` (Rolle, Position, Zustand, Clip + Phase, Aussehen)
- `VenueDefinition` (Raum, Bühne, Pit, Crowd-Zusammensetzung, Look)
- `Pose` = `Float32Array` (6 Root-Kanäle + 10 Gelenke × 3 Euler-Winkel)
- `SaveData` v1 (Einstellungen, Highscores je `song@venue`, Statistik)

## Game Loop

`Game.frame()` pro `requestAnimationFrame`:

1. `dt` = Frame-Zeit (max. 50 ms).
2. `InputManager.poll()` → Achsen + zeitgestempelte `ButtonEvent`s.
3. Events routen: im Spiel `pause`/`help`, in Menüs an den aktiven `MenuScreen` (eine physische Taste löst max.
   eine Aktion aus, z. B. Space = acro *oder* confirm).
4. Spielen: `SongClock.sync()` → `songTime`. Move-Knöpfe → `MovePress` mit `time = clock.timeAt(event.time)`.
5. `PitSession.update(dt, songTime, input)` in **60-Hz-Unterschritten** (Song-Zeit interpoliert):
   Musik-Events (Sektion/Beat/Beatdrop) → Presses → `MoveController` → Scoring/Hype → `MovementController` →
   Crowd-Simulation + Kollision (Pit-Wand) → Combo-Timer/Banking → Song-Ende.
6. `SceneView.update()` (Kamera, Licht, Spieler-Animation, Crowd-Instancing, Partikel), `Hud.update()`, Ambience.
7. `Renderer.render()`: Szene → Low-Res-Target → Post-Pass auf den Bildschirm.

Zustände: `title → menu → loading → playing ⇄ paused → ending → results`. Hinter Menüs läuft ein stummer
„Attract Mode“ (eigene Session mit simulierter Zeit), damit der Club lebt.

## Input-System

- `src/input/bindings.ts`: Tabellen Taste/Gamepad-Knopf → abstrakte `ButtonAction`s (`footwork`, `arms`, `kick`,
  `acro`, `pause`, `confirm`, `back`, `up/down/left/right`, `help`). Eine Taste darf mehrere Aktionen tragen.
- `InputManager`: Tastatur über DOM-Events (`event.code` → layoutunabhängig, `timeStamp` für Timing), Maus über
  Pointer Lock, Gamepads per Polling (Standard-Mapping, Deadzone 0,18, Kanten-Erkennung, `gamepad.timestamp`).
- Move-Tasten sind Kategorien (`footwork`, `arms`, `kick`, `acro`); `MoveController.resolve()` wählt den Move aus
  Kategorie + Situation (Stick seitlich, Tempo). Der kamerarelative Stick geht roh (`stickX/Y`) und in Weltkoordinaten mit.
- Neue Moves/Kombinationen = Daten; neue Geräte = Bindings-Tabelle + Polling im `InputManager`.

## Move-System (`MoveController`)

Zwei Ebenen (`full`, `upper`). Ein Move läuft seine `duration` (Song-Sekunden); `air` definiert Absprung/Luft/Landung
(Event `land`), `cancelFrom`/`cancelInto` das Cancel-Fenster, Drücke bis `bufferSec` vorher werden gepuffert. `bail()`
stoppt alles für `bailSec`. Events (`start`, `land`, `end`, `bail`) gehen an `PitSession`.

## Animationssystem

- **Figuren:** geskinnte GLBs aus `tools/blender/` (D-025), Clips in `anims.glb` (Mocap + umgerechnete Keyframe-Clips
  aus `src/animation/clips.ts`, die nur noch als Datenquelle der Pipeline dienen).
- **Spieler (`AnimationController`, D-028):** Unter- und Oberkörper mischen getrennt gewichtete Quellen (normalisiert).
  Quelle = Move-Clip (Zeit aus Move-Fortschritt und `clipRange`) oder Locomotion (Idle/Walk/Run nach Tempo, gemeinsame
  Zyklusphase). Neue Quellen blenden über 0,06–0,5 s ein. Arm-Moves laufen nur auf dem Oberkörper.
- **Crowd (`SkinnedCharacter`):** ein Clip pro Figur mit Überblendung, Phase aus `CrowdSim`.

## Gameplay-Architektur MOSH PIT 2.0 (D-028)

`PitSession` verbindet: `MovementController` (Momentum) · `MoveController` (Moves, Ebenen, Phasen, Cancel, Puffer) ·
`ComboManager` (Punkte, Timer) · `BeatManager` (Musik-Events/Boni) · `CrowdSim` · `HypeMeter`. Render-seitig
setzt `PlayerView` den Zustand in `AnimationController`-Ebenen um (Unterkörper: Move oder Locomotion-Mischung,
Oberkörper: Arm-Overlay oder dasselbe). Details: [PROTOTYPE_2.md](PROTOTYPE_2.md).

## Rendering

- `Renderer`: WebGLRenderer ohne AA → Render-Target ≈ 270 Zeilen (Breite nach Seitenverhältnis), Nearest-Filter →
  Post-Shader: sRGB, 4×4-Bayer-Dithering + Quantisierung auf 31 Stufen/Kanal, Blitz-Overlay, Vignette, Scanlines.
- **Grafikstufen** (`src/data/graphics.ts`, Einstellung `graphics`): `Renderer.setGraphics()` setzt Auflösung,
  Snapping, Farbstufen, Dithering, Scanlines live; das Figuren-Detail (Segmentzahl, `partGeometries(detail)`, pro
  Stufe gecacht) greift beim nächsten Szenenaufbau (nächster Song bzw. sofort im Menü-Hintergrund).
- `ps1.ts`: `onBeforeCompile`-Patch für Lambert/Basic-Materialien → Vertex-Snapping auf das Low-Res-Pixelraster.
- **Geskinnte Figuren (D-025/D-027, Standard):** `characters.ts` lädt `public/models/anims.glb` (Skelett + alle
  Clips) und `char_<variante>.glb` (Spieler + 8 Crowd-Varianten). Clips werden per Knochenname gebunden; nur
  Rotations-Tracks plus die Root-Position (auf die Hüfthöhe der Variante umgerechnet) werden genutzt.
  `SkinnedCharacter.play(clip, key, fade)` blendet über (`crossFadeTo`), wiederholte Moves wechseln zwischen zwei
  Actions desselben Clips; `setPhase()` setzt die Clip-Zeit aus dem Gameplay-Fortschritt (`timeScale = 0`).
  `SkinnedCrowdRenderer` erzeugt eine Figur pro Agent (Variante per ID, Band mit festen Varianten + Gitarren-Mesh),
  `PlayerView` nutzt die Spieler-Variante. Schatten: Spot-Licht über dem Pit (PS2/HD), nur der Spieler wirft Schatten.
  Ohne Modelle startet das Spiel nicht (Hinweis im Menü); die Box-Rig-Figuren wurden mit 2.0 entfernt.
- `VenueBuilder` (statische Geometrie aus `VenueDefinition`), `StageLights` (4 Punktlichter, Kegel, Rauch),
  `CameraController` (Orbit, Raum-/Decken-Clamping, Shake, FOV-Kick), `PlayerView`, `Particles`, `SceneView`.

## Audio-System

Siehe [AUDIO_AND_MUSIC.md](AUDIO_AND_MUSIC.md): `AudioEngine` (Mixer + Limiter), `SongClock` (Ausgabe-Zeitstempel),
`SongPlayback`-Interface mit `SynthSongPlayer` (Lookahead-Scheduler) und `FileSongPlayer` (vorbereitet), `Sfx`.

## UI

DOM-Overlay über dem Canvas (`index.html` + `src/ui/styles.css`). `Hud` schreibt nur bei Wertänderung ins DOM.
`MenuScreen`/`UIManager` bieten fokussierbare Einträge für Tastatur, Gamepad und Maus; Screens in `screens.ts`.

## Speichersystem

`SaveSystem` (localStorage-Schlüssel `moshpit.save`), Version 1. Laden merged Defaults (neue Einstellungen erhalten
Standardwerte), fremde/korrupte Daten → Neustart mit Defaults, Schreibfehler werden ignoriert. Speicher-Backend ist
injizierbar (Tests nutzen In-Memory). Bei Formatänderung: Version erhöhen und Migration ergänzen.

## Performance-Überlegungen

- Geskinnte Crowd: geteilte Geometrie/Materialien/Clips, verdeckte Körperflächen entfernt, Crowd-LOD; ≈ 1,0 Mio.
  Dreiecke / ≈ 460 Draw Calls pro Frame (D-027). Agent-Kollision über 1-m-Raster-Hash.
- Niedrige interne Auflösung → Fragment-Last minimal; 4 dynamische Punktlichter + Ambient/Hemisphere.
- Keine Allokationen im Pose-Pfad (vorallokierte `Float32Array`s), HUD ohne unnötige DOM-Writes.
- Gameplay in 60-Hz-Unterschritten, Rendering einmal pro Frame.
- Gemessen bisher nur in Headless-Chromium mit Software-Rendering (SwiftShader: mit geskinnten Figuren nur 1–2 FPS,
  da Skinning dort auf der CPU läuft); **Messung auf echter GPU steht aus** und entscheidet über weitere Optimierung.
- Bundle ≈ 670 kB (≈ 175 kB gzip), fast vollständig three.js; Code-Splitting erst bei Bedarf.

## Tests

`tests/` (Vitest, Node): Timeline, Timing, Resolver, MoveSystem (Puffer, Cancel, Bail, Air-Konvertierung,
Spiegelung), ComboSystem (Variety > Spam, Perfect > Okay, Banking, Signature-Combos), Hype, Animation (Clips
vollständig/endlich, 2-Step nahtlos, Überblendung), Save (Persistenz, Korruption, Migration) und ein **headless
Komplett-Durchlauf jedes Songs** mit Bot (`PitSession.test.ts`). Browser-Smoke-Tests (Playwright) wurden während
der Entwicklung manuell ausgeführt, sind aber noch nicht Teil der CI.
