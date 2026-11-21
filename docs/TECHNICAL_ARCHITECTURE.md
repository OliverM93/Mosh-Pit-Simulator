# Technische Architektur

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
- `MoveDefinition` (Daten) → `ActiveMove` (laufende Instanz mit Start/Ende/Anker/Rating/Spiegelung)
- `ComboState` (Pool, Multiplikator, Einträge, Nutzungszähler, Kategorien) → `BankResult`
- `SessionStats` (Moves, Ratings, Bails, beste/längste Combo, Drop-Hits)
- `CrowdAgent` (Rolle, Position, Zustand, Clip + Phase, Aussehen)
- `VenueDefinition` (Raum, Bühne, Pit, Crowd-Zusammensetzung, Look)
- `Pose` = `Float32Array` (6 Root-Kanäle + 10 Gelenke × 3 Euler-Winkel)
- `SaveData` v1 (Einstellungen, Highscores je `song@venue`, Statistik)

## Game Loop

`Game.frame()` pro `requestAnimationFrame`:

1. `dt` = Frame-Zeit (max. 50 ms).
2. `InputManager.poll()` → Achsen + zeitgestempelte `ButtonEvent`s.
3. Events routen: im Spiel `pause`/`help`, in Menüs an den aktiven `MenuScreen` (eine physische Taste löst max.
   eine Aktion aus, z. B. Space = jump *oder* confirm).
4. Spielen: `SongClock.sync()` → `songTime`. Move-Knöpfe → `MoveRequest` mit `pressTime = clock.timeAt(event.time)`.
5. `PitSession.update(dt, songTime, input)` in **60-Hz-Unterschritten** (Song-Zeit interpoliert):
   Musik-Events (Sektion/Beat/Puls/Beatdrop) → Presses → `MoveSystem` → Scoring/Hype → Spielerphysik →
   Crowd-Simulation + Kollision → Chain-Window/Banking → Song-Ende.
6. `SceneView.update()` (Kamera, Licht, Spieler-Animation, Crowd-Instancing, Partikel), `Hud.update()`, Ambience.
7. `Renderer.render()`: Szene → Low-Res-Target → Post-Pass auf den Bildschirm.

Zustände: `title → menu → loading → playing ⇄ paused → ending → results`. Hinter Menüs läuft ein stummer
„Attract Mode“ (eigene Session mit simulierter Zeit), damit der Club lebt.

## Input-System

- `src/input/bindings.ts`: Tabellen Taste/Gamepad-Knopf → abstrakte `ButtonAction`s (`step`, `arms`, `kick`,
  `floor`, `jump`, `pause`, `confirm`, `back`, `up/down/left/right`, `help`). Eine Taste darf mehrere Aktionen tragen.
- `InputManager`: Tastatur über DOM-Events (`event.code` → layoutunabhängig, `timeStamp` für Timing), Maus über
  Pointer Lock, Gamepads per Polling (Standard-Mapping, Deadzone 0,18, Kanten-Erkennung, `gamepad.timestamp`).
- `MoveResolver`: (Knopf, Richtung, in der Luft?) → `MoveDefinition`; spezifischste Richtung gewinnt.
  `classifyDirection()` teilt den kamerarelativen Stick in neutral/vor/zurück/seitlich (+ links/rechts).
- Neue Moves/Kombinationen = Daten; neue Geräte = Bindings-Tabelle + Polling im `InputManager`.

## Move-System (`MoveSystem`)

Zustandsmaschine: idle → Move → (Puffer/Cancel) → nächster Move | Bail → Erholung. Move-Ende =
`nächsterPuls(Start) + n × Puls` (n = gerundete natürliche Dauer). Hop→Air-Konvertierung verlängert bis zum
nächsten passenden Puls. Liefert Events (`start`, `convert`, `end`, `bail`, `recover`) an `PitSession`.

## Animationssystem

- **Rig:** `CharacterRig` – Hierarchie aus Gruppen (Root → Body → Spine/Hüften → Nacken, Schultern, Ellbogen, Knie);
  Körperteile sind Quader mit Pivot am Gelenk (15 Teile inkl. Mütze und Gitarre).
- **Posen/Clips:** `clips.ts` enthält handgebaute Keyframes (normierte Zeit 0..1, Easing pro Segment) für alle Moves,
  Fortbewegung, Crowd-Verhalten und Band. Sparse Specs werden auf eine Basispose gelegt und vorkompiliert.
- **Wiederverwendung:** Spiegelung (`mirrorPose`) erzeugt Links/Rechts-Varianten; derselbe Clip läuft beim Spieler,
  bei NPC-Dancern und in Varianten.
- **Treiber:** Move-Clips folgen dem Move-Fortschritt (Song-Zeit), Loops der Beat-Phase, Reaktionen der Echtzeit.
  Dadurch sind alle Animationen musiksynchron.
- **Überblendung:** `Animator` blendet bei jedem neuen Clip-*Instanz*-Schlüssel (50–180 ms, Smoothstep) und wickelt
  Winkel vorher auf den kürzesten Weg ab (keine 360°-Rückdrehungen nach Spins).

## Rendering

- `Renderer`: WebGLRenderer ohne AA → Render-Target ≈ 270 Zeilen (Breite nach Seitenverhältnis), Nearest-Filter →
  Post-Shader: sRGB, 4×4-Bayer-Dithering + Quantisierung auf 31 Stufen/Kanal, Blitz-Overlay, Vignette, Scanlines.
- `ps1.ts`: `onBeforeCompile`-Patch für Lambert/Basic-Materialien → Vertex-Snapping auf das Low-Res-Pixelraster.
- `CrowdRenderer`: **ein `InstancedMesh` pro Körperteil** für Crowd + Band (~15 Draw Calls total). Pro Agent wird die
  Pose auf ein unsichtbares Scratch-Rig gelegt und die Teil-Matrizen kopiert; Farben per `instanceColor`.
  Agenten auf der Sichtlinie Kamera→Spieler und direkt vor der Kamera werden ausgeblendet.
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

- Crowd-Instancing statt einzelner Meshes; Agent-Kollision über 1-m-Raster-Hash.
- Niedrige interne Auflösung → Fragment-Last minimal; 4 dynamische Punktlichter + Ambient/Hemisphere.
- Keine Allokationen im Pose-Pfad (vorallokierte `Float32Array`s), HUD ohne unnötige DOM-Writes.
- Gameplay in 60-Hz-Unterschritten, Rendering einmal pro Frame.
- Gemessen bisher nur in Headless-Chromium mit Software-Rendering (SwiftShader: ~20 FPS); echte GPU-Messungen stehen aus.
- Bundle ≈ 670 kB (≈ 175 kB gzip), fast vollständig three.js; Code-Splitting erst bei Bedarf.

## Tests

`tests/` (Vitest, Node): Timeline, Timing, Resolver, MoveSystem (Puffer, Cancel, Bail, Air-Konvertierung,
Spiegelung), ComboSystem (Variety > Spam, Perfect > Okay, Banking, Signature-Combos), Hype, Animation (Clips
vollständig/endlich, 2-Step nahtlos, Überblendung), Save (Persistenz, Korruption, Migration) und ein **headless
Komplett-Durchlauf jedes Songs** mit Bot (`PitSession.test.ts`). Browser-Smoke-Tests (Playwright) wurden während
der Entwicklung manuell ausgeführt, sind aber noch nicht Teil der CI.
