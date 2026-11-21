# Entscheidungslog

Wichtige Architektur- und Game-Design-Entscheidungen. Neue Einträge oben anfügen, alte nicht löschen – bei
Revision einen neuen Eintrag mit Verweis schreiben.

Format: **Datum · Entscheidung** – Begründung · Betroffene Systeme · Alternativen.

---

### D-021 · 2026-11-21 · Tech-Stack überprüft (Godot 4 + GDScript vs. TypeScript + Three.js) – vorerst beibehalten, Zielplattform offen
- **Anlass:** Externe Empfehlung, auf Godot 4 + GDScript für ein Windows-PC-Spiel zu wechseln.
- **Pro Godot:** vollwertiger Editor (Level, Licht, Partikel), komfortable Blender→glTF→AnimationTree-Pipeline,
  native Windows-Exporte (Steam), mehr Performance-Reserve, weniger Eigenbau bei Effekten.
- **Pro TypeScript + Three.js:** Phase 1 läuft und beweist den Core Loop. Musik-Timing ist der Kern des Spiels:
  Web Audio plant Noten sample-genau, Tastendrücke tragen Event-Zeitstempel (im Browser auf < 0,5 ms verifiziert).
  In Godot 4 tragen `InputEvent`s keine Zeitstempel; Eingaben sind an die Framerate gebunden (bei 60 FPS bis ~17 ms
  Quantisierung – innerhalb des Perfect-Fensters von ±51 ms verkraftbar, aber ein Nachteil). Browser = Playtests per
  Link. Alles textbasiert und headless prüfbar (Tests, CI in Sekunden, Screenshots) – passt zur Entwicklung mit Claude Code.
- **Neutral:** Kollisionen (Arcade-Kinematik, keine Physik-Engine nötig), Gamepad, Spielstand – bereits gelöst und
  klein. Skelett-Animationen aus Blender (glTF) funktionieren in beiden Stacks (Three.js: `AnimationMixer` mit Crossfades).
- **Entscheidung:** Stack bleibt, bis die Zielplattform feststeht. Ist ein eigenständiges Windows-/Steam-Spiel mit
  Editor-Arbeit des Owners das Ziel → Wechsel zu Godot 4 **vor Phase 2** (günstigster Zeitpunkt: Design, Daten,
  Tuning-Werte und Doku sind übertragbar, der Code nicht).
- **Unabhängig davon übernommen:** Animationsqualität ist das größte Risiko der Box-Rig-Lösung → geskinnte
  glTF-Charaktere mit Blender-Animationen einplanen (Roadmap Phase 2).
- **Alternativen:** Unity + C# (mehr Overhead), Unreal/C++ (überdimensioniert), Python/Panda3D, reines C++ (zu viel Eigenbau).
- **Betroffen:** gesamte Codebasis, CI, Asset-Pipeline.

### D-020 · 2026-11-21 · Leerer Initial-Commit auf `main` als PR-Basis
- **Begründung:** Das Repo war komplett leer; ohne `main` ist kein PR möglich, und der zuerst gepushte Branch wird
  Default-Branch. Vom Owner freigegeben.
- **Betroffen:** Git-Workflow.
- **Alternativen:** Session-Branch als Default-Branch (verworfen: falscher Default, kein PR).

### D-019 · 2026-11-21 · Vorerst keine Lizenzdatei
- **Begründung:** Entscheidung des Owners; bis dahin „alle Rechte vorbehalten“.
- **Betroffen:** README, Repo.
- **Alternativen:** MIT, proprietäre LICENSE – später möglich.

### D-018 · 2026-11-21 · Eine Roadmap unter `docs/ROADMAP.md`, Root-`ROADMAP.md` verweist nur
- **Begründung:** Die Anforderungen nennen beide Orte; zwei inhaltliche Roadmaps würden auseinanderlaufen.
- **Betroffen:** Dokumentation.
- **Alternativen:** Inhalt doppelt pflegen (verworfen).

### D-017 · 2026-11-21 · Dokumentation Deutsch, Code Englisch
- **Begründung:** Owner arbeitet auf Deutsch; Code/Commits auf Englisch sind Standard und tool-freundlich.
- **Betroffen:** alle Dateien.
- **Alternativen:** alles Englisch.

### D-016 · 2026-11-21 · Branch-Namen: Feature-Branches, in Cloud-Sessions der vorgegebene `claude/…`-Branch
- **Begründung:** Gewünscht sind `feature/…`, `fix/…`, `docs/…`; Claude-Code-Cloud-Sessions dürfen nur auf ihren
  zugewiesenen Branch pushen. Die Setup-Arbeit liegt daher auf `claude/laughing-bell-msxkz3`.
- **Betroffen:** Git-Workflow, CI-Trigger (`claude/**` ist enthalten).

### D-015 · 2026-11-21 · DOM-Overlay für HUD und Menüs
- **Begründung:** Schnell zu bauen, gut lesbar, Fonts/Animationen per CSS, keine Text-Rendering-Pipeline in WebGL nötig.
- **Betroffen:** `src/ui`.
- **Alternativen:** In-Canvas-UI (Sprites/Bitmap-Fonts) – authentischer, aber deutlich aufwendiger. Später möglich.

### D-014 · 2026-11-21 · localStorage-Spielstand mit Versionsnummer
- **Begründung:** Browser-Spiel ohne Backend; Versionierung erlaubt spätere Migration (Progression in v2).
- **Betroffen:** `src/save`.
- **Alternativen:** IndexedDB (unnötig für die Datenmenge), Cloud-Save (Backend nötig).

### D-013 · 2026-11-21 · Hype-Meter mit „Pit Frenzy“ als Special-Meter
- **Begründung:** THPS-Special-Meter-Analogie; verbindet Combo-Qualität direkt mit Crowd-Reaktion, Licht und Punkten.
- **Betroffen:** `HypeMeter`, `PitSession`, Crowd, Licht, HUD.
- **Alternativen:** Crowd-Reaktion nur kosmetisch (weniger Motivation).

### D-012 · 2026-11-21 · „Picking Up Change“ als zusätzlicher Move
- **Begründung:** Authentischer, humorvoller Hardcore-Move, deckt „Kombination Schritte + Arme“ ab, kostet nur Daten.
- **Betroffen:** `moves.ts`, `clips.ts`.

### D-011 · 2026-11-21 · Air-Moves aus dem Hop: Bewertung beim Absprung, Wertung bei der Landung
- **Begründung:** Der Umstieg in der Luft liegt zwangsläufig neben dem Beat; ihn zu bewerten würde jeden Air-Move
  bestrafen. Landung (clean/sketchy) bringt das THPS-Gefühl „sauber landen“.
- **Betroffen:** `MoveSystem.convert`, `PitSession.onMoveEnd`, `Player.retargetJump`.
- **Alternativen:** Akkord-Eingabe Space+R (fummelig), eigener Air-Knopf.

### D-010 · 2026-11-21 · Combo wird nach einer Pause kassiert (Chain Window), nicht beim Landen
- **Begründung:** Im Pit gibt es keine natürliche „Landung“ wie beim Skaten; der 2-Step übernimmt die Rolle des
  Manuals (Combo am Leben halten). Pause = Kassieren ist leicht zu verstehen.
- **Betroffen:** `ComboSystem.tick`, HUD (Chain-Leiste).
- **Alternativen:** Kassieren per Knopf, Kassieren am Taktende.

### D-009 · 2026-11-21 · Miss = Bail (gesamte Combo verloren)
- **Begründung:** Macht Timing zum zentralen Risiko-Element; ein Druck „gegen den Beat“ ist klar erkennbar, die
  Fenster sind großzügig (Okay bis 40 % des Pulses). Zu frühe Drücke während langer Moves werden ignoriert statt bestraft.
- **Betroffen:** `MoveSystem`, `ComboSystem.bail`, `HypeMeter`.
- **Risiko:** Könnte zu hart sein → in der Phase-2-Playtest-Runde prüfen. Alternativen: Miss = nur Multiplikator-Abzug,
  oder Bail erst bei zwei Misses in Folge.

### D-008 · 2026-11-21 · Move-Längen werden auf ganze Pulse quantisiert
- **Begründung:** Jeder Move endet exakt auf dem Raster → der nächste Druck im Takt passt immer, Animationen wirken
  musiksynchron, gepufferte Moves starten im Takt.
- **Betroffen:** `MoveSystem.start`, Animation (Fortschritt = Song-Zeit).
- **Alternativen:** Feste Sekunden-Dauern (Moves driften gegen den Beat).

### D-007 · 2026-11-21 · PS1-Look per Low-Res-Target + Vertex-Snapping + Dithering
- **Begründung:** Stärkster Retro-Effekt für wenig Aufwand, gleichzeitig günstig für die Performance.
- **Betroffen:** `Renderer`, `ps1.ts`.
- **Alternativen:** Affines Texture-Mapping (in GLSL ES 3.0 nicht sauber), CSS-Pixelation allein (kein Jitter).

### D-006 · 2026-11-21 · Crowd-Rendering: ein InstancedMesh pro Körperteil + Scratch-Rig
- **Begründung:** ~15 Draw Calls unabhängig von der Crowd-Größe; gleiche Animationen/Rigs wie beim Spieler.
- **Betroffen:** `CrowdRenderer`, `CharacterRig`.
- **Alternativen:** Ein Mesh pro NPC (hunderte Draw Calls), Skinned InstancedMesh (komplex).

### D-005 · 2026-11-21 · Prozedurale Inhalte statt Asset-Dateien in Phase 1
- **Begründung:** Keine Lizenzrisiken, keine Pipeline nötig, alles im Code versioniert; passt zum Low-Poly-Stil.
- **Betroffen:** `textures.ts`, `CharacterRig`, `VenueBuilder`, `clips.ts`.
- **Alternativen:** glTF-Modelle/Mixamo-Animationen (Lizenz/Stil-Bruch), später ergänzbar (siehe ASSET_PIPELINE.md).

### D-004 · 2026-11-21 · Musik und SFX synthetisiert (Web Audio)
- **Begründung:** Selbst erstellte, lizenzfreie Testmusik; sample-genaue Synchronität, weil jede Note auf
  AudioContext-Zeit geplant wird. `SongPlayback`-Interface erlaubt später echte Dateien.
- **Betroffen:** `src/audio`, `src/data/songs`.
- **Alternativen:** CC0-Loops (selten Hardcore, Sync aufwendiger).

### D-003 · 2026-11-21 · Timing aus Song-Metadaten, AudioContext als Master-Uhr, Event-Zeitstempel für Eingaben
- **Begründung:** Präzise, deterministisch, testbar; keine fehleranfällige Beat-Erkennung. Input-Zeitstempel machen die
  Bewertung unabhängig von der Framerate (im Browser auf < 0,5 ms verifiziert).
- **Betroffen:** `SongTimeline`, `SongClock`, `InputManager`, `MoveSystem`.
- **Alternativen:** Audioanalyse/Onset-Detection (unpräzise), `performance.now()` als Uhr (driftet gegen Audio).

### D-002 · 2026-11-21 · Gameplay headless (`PitSession`), Render/Audio/UI über Events
- **Begründung:** Saubere Trennung, Tests ohne Browser (inkl. kompletter Song-Durchläufe), austauschbares Rendering.
- **Betroffen:** gesamte Architektur.
- **Alternativen:** ECS-Framework (für den Umfang zu schwer), Logik in Three.js-Objekten (nicht testbar).

### D-001 · 2026-11-21 · Tech-Stack TypeScript + Three.js + Vite + Vitest
- **Begründung:** Repo war leer; Vorgabe bevorzugt TS/Three.js. Vite = schneller Dev-Loop, Vitest = gleiche Toolchain.
  Three.js ist die einzige Laufzeit-Abhängigkeit.
- **Betroffen:** alles.
- **Alternativen:** Babylon.js (größer), Godot/Unity (kein Web-first, andere Sprache), eigene WebGL-Engine (zu viel Aufwand).
