# Entscheidungslog

Wichtige Architektur- und Game-Design-Entscheidungen. Neue Einträge oben anfügen, alte nicht löschen – bei
Revision einen neuen Eintrag mit Verweis schreiben.

Format: **Datum · Entscheidung** – Begründung · Betroffene Systeme · Alternativen.

---

### D-027 · 2026-11-21 · Geskinnte Figuren im Spiel: ein Charakter pro NPC statt Instancing
- **Anlass:** Einbau der Blender-Figuren (D-025) in Spieler, Crowd und Band.
- **Entscheidung:** Jeder NPC ist ein eigener `SkinnedMesh`-Klon (`SkeletonUtils.clone`) einer von 8 Crowd-Varianten;
  Geometrie, Materialien und Clips werden geteilt. Wiedergabe *phasengesteuert*: das Gameplay liefert Clip + Fortschritt,
  der `AnimationMixer` macht nur die Überblendungen. Das revidiert Architekturprinzip 7 (CLAUDE.md) für Figuren:
  ≈ 5 Draw Calls pro sichtbarer Figur (Körper, Augen, Shirt, Hose, Schuhe, ggf. Kopfbedeckung).
- **Budget:** Verdeckte Körperflächen unter der Kleidung werden beim Bauen gelöscht (≈ 20–25 % der Körperdreiecke),
  Crowd-LOD 0,4 (Körper) / 0,5 (Schuhe), 512er-Texturen. Gemessen: ≈ 1,0 Mio. Dreiecke und ≈ 460 Draw Calls pro
  Frame bei 64 Figuren (vorher 1,4 Mio.). Crowd wirft keine Schatten, nur der Spieler.
- **Fallback:** Lädt `public/models/` nicht, nutzt das Spiel die alten Instanced-Figuren (`CrowdRenderer`).
- **Alternativen:** Skinned Instancing mit Animations-Textur (VAT/Bone-Texture – deutlich komplexer, erst bei
  Performance-Problemen auf echter Hardware), Meshes pro Variante zusammenführen (spart Draw Calls, braucht
  Textur-Atlas pro Figur – nächster Optimierungsschritt).

### D-026 · 2026-11-21 · Groove-Modell statt Taktdrücken (Variante A)
- **Anlass:** Owner-Playtest: Taktdrücken viel zu schnell; echte Songs haben Tempowechsel.
- **Entscheidung (Owner, Variante A):** Moves laufen in natürlicher Länge (passend zu Mocap-Animationen), Timing
  zum Beat ist nur Bonus (×1,5 / 1,25 / 1,1, Multiplikator-Bonus, Drop-Hit). Daneben drücken kostet nichts. Risiko
  ist räumlich: ein großer Move ins Gedränge (≥ 4 Personen im Platz) crasht und kostet die Combo. Combo wird nach
  0,8 s Pause kassiert.
- **Ersetzt:** D-008 (Quantisierung auf Pulse) und D-009 (Miss = Bail).
- **Betroffen:** `MoveSystem`, `timing.ts`, `ComboSystem`, `PitSession`, HUD, Hilfe, Ergebnis-Note, Tests.
- **Fallback:** Variante C (ganz ohne Rhythmus), falls A nicht trägt – Owner-Vorbehalt.
- **Offen:** Tempowechsel in Songs (BPM pro Abschnitt) für die Bonus-Bewertung.

### D-025 · 2026-11-21 · Echte Figuren aus Blender (MakeHuman CC0) mit CMU-Motion-Capture
- **Anlass:** Owner will mindestens PS2-Niveau (Referenz: Resident Evil 4, Tekken 4/5) mit echten Modellen und
  Animationen. Werkzeugwahl Claude überlassen.
- **Entscheidung:** Blender 5.3 headless (`bpy`-Modul) baut die Figuren per Skript aus dem MakeHuman-Basismodell
  (CC0, professionell modellierter Körper, Morph-Targets, Skelett + Gewichtung). Kleidung wird aus dem Körper
  modelliert (Shirt, Baggy Pants, Sneaker, Cap) und mitgeskinnt. Bewegungen kommen aus der CMU-Mocap-Datenbank
  (frei, auch kommerziell) und werden per eigenem Retargeting auf ein 38-Knochen-Spielskelett übertragen.
  Export als glTF/GLB, im Browser `SkinnedMesh` + `AnimationMixer`.
- **Begründung:** Three.js ist nicht der Engpass (Skinning, PBR, Schatten vorhanden), sondern die Assets. Externe
  Asset-Seiten (Mixamo, Sketchfab, Blender-Download) sind in der Cloud-Umgebung nicht erreichbar, GitHub und PyPI
  schon. Alles bleibt per Skript reproduzierbar (`tools/blender/`).
- **Stand:** Prototyp (eine Figur, Spinkick + Cartwheel) läuft im Viewer; Spiel nutzt noch die alten Figuren.
- **Alternativen:** Figuren per Skript aus Grundformen „schnitzen“ (Qualität zu gering), Mixamo (Account nötig,
  nicht erreichbar), Engine-Wechsel (löst das Asset-Problem nicht).

### D-024 · 2026-11-21 · Grafikstufen PS1 / PS2 / HD, Standard PS2
- **Begründung:** Owner findet den PS1-Look zu low-poly. Statt den Stil fest umzustellen, sind die Retro-Effekte
  jetzt einstellbar; Standard ist PS2 (540p, kein Jitter, runde Figuren). So lässt sich beim Testen vergleichen.
- **Betroffen:** `src/data/graphics.ts`, `Renderer`, `characterParts.ts`, `SceneView`, `SaveSystem` (neues Feld
  `graphics`, Default-Merge), Einstellungen.
- **Alternativen:** Feste Umstellung; echte Modelle aus Blender (nächster Qualitätssprung, siehe D-021/D-022).

### D-023 · 2026-11-21 · Echte Bandnamen auf Merch und Flyern
- **Entscheidung (Owner):** Shirts und Wand-Flyer zeigen Namen echter Bands statt fiktiver (Hatebreed, Madball,
  Knocked Loose, Turnstile, Terror, Sick Of It All; Flyer: Agnostic Front, Cro-Mags, Biohazard, Comeback Kid,
  Kublai Khan, Terror).
- **Umsetzung:** Nur Namen als Text in eigener Typografie, keine Original-Logos. Zentral in `MERCH_BANDS`
  (`src/data/appearance.ts`) und `look.posters` (`src/data/venues.ts`) – mit einer Änderung austauschbar.
- **Grenze:** Songs und die Band auf der Bühne bleiben fiktiv, solange die Musik synthetisiert ist – sonst würden
  erfundene Songs echten Bands zugeschrieben. Mit lizenzierten Aufnahmen kommen die echten Namen dazu.
- **Risiko:** Bandnamen sind Marken. Für einen privaten Prototyp unkritisch; vor kommerzieller Veröffentlichung
  Erlaubnis einholen oder Liste ersetzen.
- **Ersetzt:** den Teil von D-022, der alle Prints fiktiv vorsah.

### D-022 · 2026-11-21 · Fighting-Game-Figuren statt Quader, Outfits als Atlas-Daten
- **Begründung:** Owner-Feedback: Quaderfiguren wirken klobig; Referenz ist der PS1-Look von 3D-Fightern (Tekken 3)
  und Fotos echter Hardcore-Bands. Glatt schattierte Low-Poly-Teile + Texturatlanten erreichen das ohne externe
  Modelle, behalten das Instancing (ein Draw Call pro Teil) und legen das Datenmodell für Outfit-Unlocks (Phase 3).
- **Betroffen:** `characterParts.ts`, `characterTextures.ts`, `CharacterRig`, `CrowdRenderer`, `PlayerView`,
  `ps1.ts` (Atlas-Attribut), `src/data/appearance.ts`, `CrowdSim`.
- **Alternativen:** Geskinnte glTF-Modelle aus Blender (beste Qualität, aber Asset-Pipeline nötig – bleibt für
  Phase 2/3 geplant, siehe D-021); mehr Quader-Details (bleibt klobig).
- **Hinweis:** Keine echten Logos (Bands, Sportteams, Marken) aus den Referenzfotos – nur Stil und Typen übernommen.

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
