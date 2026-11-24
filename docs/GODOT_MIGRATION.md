# Godot-Migration – Analyse, Zielarchitektur und Migrationsplan

Stand: 2026-11-24 · Branch `claude/godot-migration` (abgezweigt von `claude/mosh-pit-2-prototype`) · Entscheidung: D-032.
Auftrag des Owners: „Strategische Neuentwicklung: Mosh Pit Simulator – Migration von Three.js zu Godot“, erster
Arbeitsauftrag: **nur Analyse und Plan, noch keine Migration.** Die Three.js-Implementierung bleibt unverändert.

**Kennzeichnung:** **[B]** = belegt (im Repo gemessen oder nachgelesen, Quelle angegeben) · **[V]** = technische
Vermutung (plausibel, nicht gemessen) · **[E]** = Empfehlung · **[O]** = Entscheidung des Owners nötig.

---

## 0. Kurzfassung

1. **Gameplay-Kern ist solide und übertragbar** [B]: Momentum-Movement, hybrides Move-System mit Ebenen, Phasen,
   Cancel-Fenstern und Puffer, THPS-Combo mit Timer, Musik-Boni, Hype – sauber getrennt, headless, 46 Tests. Diese
   Logik wird nach GDScript portiert, nicht neu erfunden.
2. **Die Animationsprobleme liegen nicht an Three.js** [B/V], sondern an *Daten und Vorgehen*: Mocap-Clips werden
   beim Export um 25 % verlangsamt und im Spiel auf feste Dauern umgezerrt (Kicks laufen mit 78–91 % der echten
   Geschwindigkeit, der Crowd-2-Step mit ~200 %), 18–30 % jedes Kicks werden in die Grundhaltung überblendet, fünf
   Quellen mit unterschiedlichem Stil werden gemischt, Clips sind „in place“ ohne Fuß-IK, die Crowd läuft zu 80 %
   phasengleich mit Clips aus einem 10-Gelenk-Box-Rig. Details in Abschnitt 4.
3. **Godot löst das nicht automatisch.** Es bringt aber die Werkzeuge, die bisher selbst gebaut oder gefehlt
   haben: AnimationTree (State Machines, Blend Spaces, OneShots, Filter, additive Ebenen), Retargeting beim Import,
   Root Motion, Skeleton-Modifier (IK, Look-At), Teil-Ragdolls, Physik, Volumetrie-Nebel, Editor mit Live-Vorschau.
4. **Der entscheidende Wechsel ist die Herkunft der Animationen** [E]: Weg von „Claude baut Bewegungen per Skript
   aus Video/IK“, hin zu **professionellen, von Menschen aufgenommenen oder animierten Clips** (gekaufte/freie
   Mocap-Pakete für Fortbewegung, Stolpern, Fallen, Aufstehen; eigene Aufnahmen echter Hardcore-Moves mit
   markerlosem Mocap). Die Engine sorgt dann für saubere Übergänge, Fußkontakt und Reaktionen.
5. **Plan:** Vertical Slice in vier Gates (Animation → Steuerung → Look → Crowd), jedes mit messbaren
   Abnahmekriterien und Owner-Abnahme, bevor Gameplay-Systeme migriert werden.
6. **Größte Risiken:** Animationsbeschaffung (Qualität + Lizenz), Figuren auf PS3-Niveau (Haare, Kleidung),
   Godot ist in der Cloud-Umgebung derzeit nicht installierbar (github.com gesperrt), Performance vieler geskinnter
   Figuren. Abschnitt 11.
7. **Owner-Entscheidungen vor dem Start** (Abschnitt 12): Animationsquelle, Figuren-Weg, Godot-Version und
   Zielplattform, Netzwerkfreigabe für Godot in der Cloud, Interaktions-Eingabe.

---

## 1. Bestandsaufnahme

### 1.1 Umfang [B]

| Bereich | Umfang |
| --- | --- |
| Branches | `main` (leer), `claude/laughing-bell-msxkz3` (Phase-1-Stand, PR offen, Referenz), `claude/mosh-pit-2-prototype` (aktueller 2.0-Prototyp) |
| Code | `src/` 7 281 Zeilen TypeScript, `tests/` 631 Zeilen (46 Tests), `tools/blender/` 2 419 Zeilen Python, CSS 523 Zeilen |
| Doku | 11 Fachdokumente in `docs/` (≈ 1 200 Zeilen), D-001 … D-031 in `DECISIONS.md` |
| 3D-Assets | `public/models/`: `anims.glb` (Skelett, 47 Clips), `char_player.glb`, `char_c1…c8.glb` (8 Crowd-/Band-Varianten) |
| Quelldaten | `tools/blender/keyframe_clips.json` (alte Box-Rig-Clips), `tools/blender/video/*_pose.json` (Video-Landmarken) |
| Audio | keine Dateien – Musik und SFX werden zur Laufzeit synthetisiert (Web Audio) |
| Texturen Umgebung | keine Dateien – Canvas-2D-Generatoren in `src/render/textures.ts` |

### 1.2 Features nach Status

**1 – Vollständig implementiert (2.0-Prototyp)** [B]

| Feature | Ort | Kernparameter |
| --- | --- | --- |
| Momentum-Bewegung (Antritt, Bremsen, Skid, Kurvenradius nach Tempo, Sprint-Anlauf) | `MovementController.ts` | walk 3,1 / sprint 5,8 m/s, Wenderate 16 → 4,2 rad/s |
| Hybride Move-Eingabe (Kategorie-Taste + Stick/Tempo) | `MoveController.resolve` | 4 Kategorien: Footwork, Arms, Kick, Acro |
| 7 Moves mit Ebenen `full`/`upper`, Luftphasen, Cancel-Fenstern, 0,3-s-Puffer, Halten = Wiederholen, Seitenwechsel, Clip-Varianten | `src/data/moves.ts` | 2-Step, Windmill, Arm Swing, Spinkick, Tornado Kick, Cartwheel, Butterfly Kick |
| THPS-Combo: Basis × Multiplikator, Wiederholungsabzug, Clean Link, Momentum, Landung, Layering, Variation, Combo-Timer 2,5 s, Bail | `ComboManager.ts` | `COMBO_TUNING` |
| Musik als Bonus: On-Beat ±80 ms, Breakdown/Heavy-Faktoren, Beatdrop-Treffer | `BeatManager.ts`, `SongTimeline.ts` | `BEAT_TUNING` |
| Hype-Meter + Pit Frenzy | `HypeMeter.ts` | |
| Räumliches Risiko: Crash bei ≥ 4 Leuten im Platzbedarf, wackelige Landung, Wegstoßen | `PitSession.ts`, `CrowdSim.ts` | `SESSION_TUNING` |
| Crowd: 64 Zuschauer als atmende Pit-Wand, 2 Dancer, 1 Ninja, Crowd-Surfer, Band; Abstoßung über 1-m-Raster; Reaktionen (Jubel, „Ohh“, Schubsen, Stolpern) | `CrowdSim.ts` | `CROWD_TUNING` |
| Feste Kamera Richtung Band (D-029), Shake, FOV-Kick, Sichtlinien-Ausblendung | `CameraController.ts`, `SkinnedCrowdRenderer.ts` | `CAMERA_TUNING` |
| Geskinnte Figuren (MakeHuman-Basis) mit Ober-/Unterkörper-Mischung beim Spieler | `characters.ts`, `AnimationController.ts` | 38 Knochen |
| HUD (Score, Combo-Liste, Timer, Hype, Banner), Menüs, Pause, Hilfe | `src/ui/` | DOM-Overlay |
| Spielstand (Einstellungen, Highscores, Statistik), versioniert | `SaveSystem.ts` | localStorage v1 |
| Synth-Testsong „Basement Rules“ (165 BPM, Breakdowns, Beatdrop), Synth-SFX, Crowd-Ambience | `src/audio/`, `src/data/songs/` | |
| Venue „The Basement“ aus Primitiven (17 × 16 × 3,2 m, Pit-Radius 4,8 m) | `VenueBuilder.ts`, `venues.ts` | |
| Grafikstufen PS1/PS2/HD | `graphics.ts`, `Renderer.ts` | |

**2 – Teilweise implementiert** [B]

| Feature | Was fehlt |
| --- | --- |
| Animationsqualität aller Moves | vom Owner wiederholt als unnatürlich bewertet (D-029 – D-031) |
| Bail | kein Aufsteh-Clip, harte Überblendung aus dem Liegen |
| Eigene Songs/Logos (`userSongs.ts`, `tempo.ts`) | Parser + BPM-Erkennung vorhanden, Loader mit 2.0 entfernt |
| `FileSongPlayer` (echte Audiodateien) | mangels Dateien ungetestet |
| Gamepad | Code vorhanden, nie mit echter Hardware getestet |
| Performance | nur in Software-Rendering gemessen (1–2 FPS mit geskinnten Figuren), keine GPU-Messung |
| Crowd vor der Kamera | wird hart ausgeblendet statt weich (Dither) |

**3 – Geplant (Roadmap, nicht implementiert)** [B]: Karriere (Keller → Festival), Währung/Reputation, Unlocks,
Charakter-Editor, Kleidung/Merch-Auswahl, weitere Venues (Jugendzentrum, Club, Halle, Open Air, Festival),
Challenge-Modus, Stage-Diver, Circle-Pit-Phasen, Crowd-Surfer abfangen, weitere Moves (Stage Dive, Floorpunch,
Haymaker …), Linter, Playwright-Smoke-Test in CI, Deployment.

**4 – Technische Prototypen** [B]: Video-Mocap mit MediaPipe (`videomocap.py`), IK-Authoring (`authoring.py`),
Bandai-Retargeting über Kalibrier-Frame (`retarget.py`), Animations-Viewer (`viewer.html`).

**5 – Bekannte Probleme** [B]: siehe Abschnitt 4 (Animation), dazu: Bandai-Clips nur CC BY-NC; Referenzvideos
ungeklärter Herkunft; echte Bandnamen auf Merch nur für privat geklärt (D-023); keine Lizenzdatei (D-019); Synth-
Musik ist Platzhalter; Fallback-Fonts unter Linux.

**Aus dem Referenz-Branch (Phase 1), mit 2.0 bewusst entfernt** [B]: Rhythmus-Bewertung Perfect/Good/Okay,
Modi Arcade/Free Pit, Song-Auswahl (3 Synth-Songs), Signature-Combos, 11 Moves des alten Systems
(Crowd Push, Picking Up Change, Floorwork, Hop …), Box-Rig-Figuren mit Outfit-Atlanten.

### 1.3 Gegenüberstellung: bisherige Anforderungen ↔ neue Vision

| Aspekt | Bisher (Phase 1 → 2.0) | Neue Vision (2026-11-24) | Konsequenz |
| --- | --- | --- | --- |
| Kern | THPS-Combos im Pit, Musik nur Bonus (D-028) | Mosh-Pit-Simulator: bewegen, moshen, *mit Menschen interagieren*, Pit-Situationen erleben | Combo/Move-System bleibt; **Crowd und Körperkontakt werden Kernsystem** statt Kulisse |
| Grafik | PS1/PS2-Retro (Dithering, Vertex-Jitter, 540p), Ziel THUG2/Def Jam | ca. **PS3-Generation**, konsistent, kein Fotorealismus | Retro-Filter entfallen; PBR, Normal Maps, Haare, Volumetrie |
| Physik | „kinematisch und verzeihend“ (PROJECT_VISION) | glaubwürdige Kollisionen und Reaktionen, hybrid | Neues Kontakt-/Reaktionssystem |
| Animation | Clip-Zeit = Move-Fortschritt, Gameplay bestimmt Dauer | natürlich, kraftvoll, Gewicht, ohne Foot Sliding | Timing-Daten aus den Clips (Abschnitt 7.2) |
| Crowd | Wand + 3 Tänzer, Crash-Risiko | lebendige, organische Gruppe, Gruppenbewegung, Reaktionen auf Spieler | Tier-System, Pit-Zustände (Circle Pit, Push, Pogo …) |
| Locations | eine, weitere geplant | mehrere kleine, eigenständige Locations | Location-System als Szene + Daten-Ressource |
| Plattform | Browser | Godot-Desktop (Annahme: Windows-PC) [O] | Export-Presets, Gamepad-Test auf Hardware |
| Steuerung | Momentum, 4 Move-Tasten | präzise, Ausweichen, Sprünge, Schubsen, Auffangen/Hochziehen | Interaktions-Eingabe ergänzen [O] |
| Musik | Synth, Timing aus Metadaten | Konzertatmosphäre | Daten bleiben, Wiedergabe als Audiodateien |

---

## 2. Übersicht der implementierten Gameplay-Systeme

```
InputManager ─► FrameInput ─► PitSession (headless, 60-Hz-Unterschritte)
                                ├─ MovementController   Momentum, Skid, Kurven, Wand-Clamp
                                ├─ MoveController       Kategorie→Move, Ebenen, Phasen, Cancel, Puffer, Halten
                                ├─ ComboManager         Punkte, Faktoren, Timer, Banken, Bail
                                ├─ BeatManager          Beat/Sektion/Drop → Boni, Energie
                                ├─ HypeMeter            Frenzy
                                └─ CrowdSim             Rollen, Abstoßung, Reaktionen, Crash-Zählung
                              events ─► SceneView (PlayerView/AnimationController, Crowd, Licht, Kamera), Hud, Sfx
```

Bewertung je System und Entscheidung für Godot:

| System | Qualität heute | Godot | Begründung |
| --- | --- | --- | --- |
| `MovementController` | gut, getestet; zu harte Pivots | **anpassen** | Regeln bleiben, Umsetzung auf `CharacterBody3D.velocity`; Drehung an Turn-/Pivot-Clips koppeln |
| `MoveController` | gut, getestet | **übernehmen** (Port) | Hybrid-Eingabe, Ebenen, Puffer, Cancel sind Kern der Spielidentität. Änderung: Zeitwerte aus Clip-Markern |
| `ComboManager` | gut, getestet | **übernehmen** 1:1 | reine Logik |
| `SongTimeline`, `BeatManager` | gut, getestet | **übernehmen** (Port) | Uhr aus `AudioServer` statt AudioContext |
| `HypeMeter` | gut | **übernehmen** | |
| `PitSession` | Orchestrator | **anpassen** | wird Session-Node der Level-Szene; Events → Signale |
| `CrowdSim` | Atmosphäre ok, keine echten Reaktionen | **neu** (`CrowdDirector`) | Rollen und Parameter übernehmen, Verhalten/Tiers/Kontakt neu |
| `AnimationController`, `PlayerView`, `characters.ts` | Kern des Problems | **neu** | AnimationTree + Skeleton-Modifier |
| `CameraController` | ok | **anpassen** | feste Band-Richtung bleibt (D-029), SpringArm3D, Dither statt Ausblenden |
| `InputManager`, `bindings.ts` | ok | **neu** (Input Map) | Belegung übernehmen |
| HUD/Menüs (DOM) | ok | **neu** (Control + Theme) | Layout, Farben, Texte übernehmen |
| `SaveSystem` | ok, getestet | **anpassen** | `user://save.json`, gleiche Versionierung/Migration |
| Synth-Audio | Platzhalter | **Daten übernehmen, Wiedergabe neu** | Songs/SFX offline zu OGG rendern (Abschnitt 9) |
| `Renderer`, `ps1.ts`, Grafikstufen | Retro-Look | **entfällt** | nicht mehr Zielbild; Qualitätsstufen über Godot-Einstellungen |
| `VenueBuilder`, `textures.ts`, `StageLights`, `Particles` | Primitive, Fake-Volumetrie | **neu** | modellierte Szene im Editor, echte Volumetrie, GPU-Partikel; Licht-Reaktionslogik übernehmen |
| Tests (46) | | **als Spezifikation portieren** | gdUnit4 o. Ä., headless |

---

## 3. Kritische Bewertung der Three.js-Architektur

**Was gut war** [B]
- Strikte Trennung headless Gameplay ↔ Darstellung (D-002), Tuning-Objekte statt Magic Numbers, Daten statt Code,
  schnelle Tests (CI in Sekunden). Dieses Prinzip wird in Godot beibehalten (reine `RefCounted`-Logikklassen).
- Timing aus Song-Metadaten statt Audioanalyse (D-003) – bleibt gültig.

**Was nicht trug**
- **Alles Eigenbau** [B]: Ebenen-Mischung (`AnimationController`), Pose-Matching, Retargeting, IK-Authoring,
  Video-Mocap, Bodenkorrektur, Crowd-Rendering, Licht-Fakes, UI – jedes Teil funktioniert isoliert, aber nichts
  davon hat die Werkzeugtiefe einer Engine (kein Animations-Editor, keine Blend-Space-Vorschau, keine IK zur
  Laufzeit, keine Physik-Reaktionen, keine Volumetrie).
- **Kein interaktives Werkzeug für Bewegungsqualität** [B]: Animationen wurden per Python-Skript gebaut und über
  Standbild-Kontaktbögen beurteilt. Der Owner war die einzige Bewegungs-Qualitätskontrolle; drei Iterationen
  (D-029, D-030, D-031) haben das Grundproblem nicht gelöst.
- **„Animation folgt der Logik“ wörtlich genommen** [B]: D-028 macht Clip-Zeit = Move-Fortschritt mit
  festen Dauern aus den Daten. Das zerrt jede Aufnahme auf eine Zahl, die nicht aus der Bewegung stammt
  (Abschnitt 4, Befund A1). Richtig ist: Gameplay entscheidet *was* passiert; *wie lange* eine Bewegung dauert,
  ist eine Eigenschaft der Aufnahme.
- **Crowd und Spieler auf getrennten Animationspfaden** [B]: Spieler mit Ebenen-Mischer, NPCs mit genau einem
  Clip und Phase aus `CrowdSim` – nahe NPCs können deshalb weder Übergänge noch Reaktionen wie der Spieler zeigen.
- **Performance unbewiesen** [B]: ≈ 1,0 Mio. Dreiecke, ≈ 460 Draw Calls bei 64 Figuren (D-027), nie auf GPU gemessen.
- **Die Engine war nicht der Engpass für Animationsqualität** [V]: three.js' `AnimationMixer` spielt Mocap korrekt
  ab. Der Wechsel lohnt sich wegen der Werkzeuge, der Physik, des Renderings und des Editors – nicht, weil Godot
  dieselben Daten schöner abspielen würde.

**Zur früheren Engine-Entscheidung (D-021):** Hauptgrund für Three.js war damals die sample-genaue Eingabe-
Zeitmessung für ein Rhythmusspiel. Mit D-028 (kein Rhythmusspiel, Musik nur Bonus, On-Beat-Fenster ±80 ms) ist
dieser Grund entfallen; eine Frame-Quantisierung von ≈ 16,7 ms ist für einen Bonus unkritisch [B: Werte aus
`BEAT_TUNING`/D-021].

---

## 4. Analyse der Animationsprobleme

Gemessen mit einem GLB-Parser an `public/models/anims.glb` und an den Build-Skripten (Messskript liegt nicht im
Repo; Werte reproduzierbar über Clip-Dauern/Keyframes im GLB).

### 4.1 Belegte Ursachen

**A1 – Mocap läuft nicht mit der aufgenommenen Geschwindigkeit** [B]
- `retarget.py` legt Keys mit 1/30 s Abstand an (`step` = 4 Frames bei 120 fps), schreibt sie aber auf ganze
  Blender-Frames (`keyframe_insert(frame=k + 1)`); die Szene läuft mit 24 fps. **Jeder retargetete Clip ist im
  Asset 25 % langsamer als aufgenommen.**
- `moves.ts` überschreibt danach die Dauer (`duration`, `clipRange [0,1]`). Effektiv gegenüber der Aufnahme:

| Move | echte Länge (Quelle) | Clip im GLB | Spieldauer | Abspieltempo vs. Aufnahme |
| --- | --- | --- | --- | --- |
| Spinkick (CMU 88_06, 88 Frames @120) | 0,73 s | 0,96 s | 0,85 s | **0,86×** |
| Tornado Kick (CMU 87_01) | 0,93 s | 1,21 s | 1,05 s | **0,89×** |
| Butterfly Kick (CMU 90_05) | 1,05 s | 1,33 s | 1,15 s | **0,91×** |
| Cartwheel (CMU 90_02) | 0,89 s | 1,13 s | 1,15 s | **0,78×** |
| 2-Step (Video, Hälfte eines 1,5-s-Zyklus) | 0,75 s | 1,00 s | 0,65 s | 1,15× |
| 2-Step der Crowd (1 Puls bei 165 BPM) | 0,75 s | 1,00 s | 0,36 s | **≈ 2,1×** |
| Arm Swing / Windmill (IK, kein Vorbild) | – | 0,79 / 1,17 s | 0,55 / 0,85 s | 1,44× / 1,38× ggü. Authoring |

  Kicks und Akrobatik laufen also 9–22 % *langsamer* als echt → „kraftlos“. Der Crowd-2-Step läuft doppelt so
  schnell → „mechanisch“. Das betrifft genau die Kritikpunkte des Owners.

**A2 – Anfang und Ende jedes Moves werden weginterpoliert** [B]
- `STANCE_MATCH = ('stance', 0.18, 0.3)`: die ersten 18 % und die letzten 30 % jedes Kick-/Akro-Clips werden zur
  Grundhaltung überblendet (`postprocess`). Genau dort liegen Ausholbewegung (Antizipation) und Nachschwung/
  Abfangen (Follow-through), die Gewicht vermitteln. Mit `cancelFrom` 0,72–0,80 wird das Abfangen zusätzlich
  meist abgeschnitten.

**A3 – Fünf Quellen, fünf Bewegungsstile** [B]
- Bandai (Kampfhaltung, Gang/Lauf/Dash, High Kick), CMU (11 Takes von 8 Darstellern), IK-Skript
  (Arm Swing, Windmill), Video-Mocap (2-Step), aus dem alten 10-Gelenk-Box-Rig umgerechnete Keyframes (18 Clips).
  Haltung, Energie und Schwerpunkt passen nicht zueinander. Beispiel Hüfthöhe der Root: `stance` 0,89–0,91 m,
  `two_step` 0,96–1,05 m → **der Körper springt beim Wechsel in den 2-Step um ≥ 5 cm nach oben**, überblendet in 0,12 s.

**A4 – Die Crowd nutzt die schwächsten Clips** [B]
- Zuschauer spielen fast nur umgerechnete Box-Rig-Clips (`bob`, `headbang`, `fist_pump`, `arms_crossed`, `ooh`,
  `shove`, `stumble` …): Quelle ist ein Posenformat mit 10 Gelenken (`pose.ts`: Wirbelsäule, Hals, Schultern,
  Ellbogen, Hüften, Knie – keine Hände, Füße, Wirbelketten), 31 Keys pro 1,29 s.

**A5 – Die Crowd ist synchron** [B]
- `beatOffset` ist für 80 % der Zuschauer 0 (sonst 0,5 Beat), die Loop-Phase ist an den Beat gekoppelt, die
  Clip-Auswahl hängt nur an Energie und 4 Typen → ganze Reihen bewegen sich im Gleichschritt.

**A6 – Kein Fußkontakt zur Laufzeit** [B]
- Alle Mocap-Clips sind „in place“ (Root-XZ-Bewegung 0 m, außer Video-2-Step 0,07–0,27 m). Fortbewegung kommt
  aus dem Code (z. B. Cartwheel `sideImpulse` 2,8 m/s), Füße werden nicht am Boden gehalten (keine Fuß-IK, kein
  Foot Locking). Bodenkontakt nur beim Bauen (`settle_keys`). Folge: Rutschen bei Moves mit Fortbewegung und bei
  NPCs, die sich mit `vx/vz` bewegen und dabei Tanz-Clips spielen.

**A7 – Fortbewegung ohne Übergangsphasen** [B]
- Nur Loops (Stance, Swagger, Jog, Dash) gemischt nach Tempo. Keine Start-, Stopp-, Wende- oder Pivot-Clips,
  keine Gewichtsverlagerung bei Beschleunigung. Drehung bis 16 rad/s (≈ 900°/s), unter 0,6 m/s sofortiger Pivot
  → der Körper „schnappt“ in die neue Richtung.

**A8 – Ebenen ohne additive Mischung** [B]
- Ober-/Unterkörper sind eine harte Maske; `spine01–03` gehören zum Oberkörper. Läuft ein Arm-Move über dem
  2-Step, ersetzt er die Rumpfrotation und den Hüpfer-Nachschwung des 2-Steps durch die eines Clips, der auf einer
  *stehenden* Grundhaltung gebaut wurde.

**A9 – Skelett und Mesh** [B]
- 38 Knochen (MakeHuman-Default reduziert): keine Finger (Hände starr), keine Helfer-/Korrekturknochen (nur je ein
  Zusatzknochen pro Ober-/Unterarm und -bein), Kleidung per Skript aus dem Körper geschnitten und Gewichte übertragen.

**A10 – Keine physikalischen Reaktionen** [B]
- Kontakt = Positionskorrektur (`separate`, `resolvePlayer`), Treffer = Geschwindigkeit setzen + Clip „stumble“.
  Kein Impulsaustausch, keine Richtung der Reaktion, kein Fallen/Aufstehen.

**A11 – Vorgehen** [B]
- Bewegungen wurden ohne Animator und ohne interaktives Werkzeug erzeugt (IK-Formeln, monokulare Pose-Schätzung,
  Spreizfaktoren ×2,3). Jede Iteration war eine Parameteränderung an einem Skript.

### 4.2 Vermutungen

- **V1** Die Summe aus A1 + A2 + A3 erklärt den Großteil von „unnatürlich, kraftlos, falsches Timing“; Three.js
  selbst trägt wenig bei.
- **V2** Monokulare Tiefe (MediaPipe) verwechselt beim 2-Step vorne/hinten der kreuzenden Beine; die nachträgliche
  Spreizung verstärkt Fehler statt sie zu beheben.
- **V3** Die Grundhaltung aus einem Kampfkunst-Take (Boxer-Deckung) wirkt nicht wie ein Hardcore-Kid im Pit.
- **V4** 24-fps-Keys mit linearer Interpolation glätten schnelle Spitzen (Kick-Treffpunkt) leicht – Nebeneffekt,
  keine Hauptursache.

### 4.3 Antworten auf die Leitfragen des Auftrags

| Frage | Antwort |
| --- | --- |
| Sind die Animationen selbst ungeeignet? | **Ja, großteils** (A1–A4, A11). Brauchbar als Platzhalter: Bandai-Fortbewegung, CMU-Kicks im Originaltempo. |
| Ist das Rigging problematisch? | **Teilweise** (A9): reicht für Ganzkörperbewegung, nicht für PS3-Niveau (Finger, Gesicht, Kleidungs-/Haar-Knochen). |
| Fehlen Bewegungsphasen? | **Ja** (A2, A7): Antizipation/Follow-through weggeblendet, kein Start/Stopp/Drehen, kein Aufstehen. |
| Sind die Übergänge falsch konzipiert? | **Ja**: alles über eine gemeinsame Grundhaltung (Pose-Matching) statt über passende Übergangsclips, Sync-Gruppen und Inertialisierung. |
| Ist Steuerung schlecht mit Animation synchronisiert? | **Ja** (A1, A6, A7): Dauern, Fortbewegung und Drehung kommen aus dem Code, die Animation wird hinterhergezerrt. |
| Werden physikalische Reaktionen falsch simuliert? | Es gibt **keine** (A10). |
| Fehlt eine Architektur für viele Charaktere? | **Ja** (A4, A5): NPCs haben einen eigenen, ärmeren Animationspfad, keine Qualitätsstufen, keine Desynchronisierung. |

---

## 5. Bewertung der Charaktermodelle, Rigs und Animationen

| Asset | Befund [B] | Bewertung |
| --- | --- | --- |
| `char_player.glb` | 26 768 Dreiecke, 6 Meshes/Materialien (Körper 17 680, Shirt, Hose, Schuhe, Cap, Augen), 1024er-Texturen, PBR ohne Normal Maps, keine Haar-Meshes | Polygonzahl reicht für PS3-Niveau; es fehlen Normal Maps, Haare, Stoffdetails, Gesichtsrig. **Platzhalter für den Slice** |
| `char_c1…c8.glb` | ≈ 15 000 Dreiecke, 5–6 Materialien, 512er-Texturen, Körper-LOD 0,4 | gut unterscheidbare Silhouetten (4 Körpertypen, 3 Hauttöne, Kopfbedeckungen), aber gleiche Kleidungsgrundformen. **Platzhalter** |
| Skelett (38 Knochen) | MakeHuman-Default reduziert, keine Finger | für Retargeting auf Godots `SkeletonProfileHumanoid` abbildbar (Finger bleiben leer). **Ersetzen** durch ein Game-Rig mit Fingern (z. B. MPFB2-„Game Engine“-Rig) [V: Verfügbarkeit/Export prüfen] |
| Fortbewegung `stance`, `swagger`, `jog`, `dash` (Bandai) | saubere Loops, CC BY-NC | **übergangsweise** (nur privat), ersetzen |
| `idle`, `walk`, `run` (CMU) | neutral, ungenutzt im 2.0-Spieler | verwerfen bzw. Referenz |
| Kicks/Akro (CMU) | echte Mocap, falsch getimt (A1), Enden weggeblendet (A2) | **neu exportieren** im Originaltempo, ohne Pose-Matching → Platzhalter |
| `two_step*`, `arm_swing`, `windmill` (Video/IK) | vom Owner abgelehnt | **ersetzen** durch echte Aufnahmen |
| 18 Crowd-/Band-Clips (Box-Rig) | 10 Gelenke, mechanisch | **ersetzen** |
| `bail`, `floorwork`, `cheer`, `hop` (CMU) | brauchbare Rohdaten | Platzhalter |

**Fazit:** Die vorhandenen Figuren und Clips tragen einen *technischen* Slice (Import, Retargeting, AnimationTree,
Crowd-Tiers, Performance), aber **nicht** den Qualitätsnachweis, den der Slice erbringen soll. Dafür werden neue
Animationen (und mittelfristig neue Figuren) gebraucht – siehe Abschnitt 7.3 und 12.

---

## 6. Godot-Zielarchitektur

### 6.1 Grundsätze

1. **Engine-Werkzeuge vor Eigenbau:** AnimationTree, Import-Retargeting, Root Motion, Skeleton-Modifier, Physik,
   Volumetrie, Input Map, Control-UI, Resources.
2. **Logik bleibt testbar:** Move/Combo/Beat/Hype/Timeline als reine GDScript-Klassen (`RefCounted`) ohne
   Szenenbezug, Tests headless.
3. **Ein Körper für alle:** Spieler und nahe NPCs teilen dieselbe `Mosher`-Szene (Körper, AnimationTree, Reaktionen).
   Unterschied ist nur das „Gehirn“ (`PlayerBrain` liest Input, `NpcBrain` folgt dem `CrowdDirector`).
4. **Daten als Resources:** Moves, Songs, Venues, Tuning, Crowd-Profile als `.tres` mit typisierten Klassen
   (`class_name MoveDef extends Resource`) – im Editor bearbeitbar, im Diff lesbar.
5. **Signale statt Kopplung:** Systeme melden Ereignisse (`move_started`, `landed`, `contact`, `combo_banked` …),
   Darstellung/Audio/UI hören zu. Ein schlanker Autoload `Events` nur für spielweite Ereignisse.
6. **Kleine Skripte:** Richtwert ≤ 300 Zeilen pro Skript, eine Verantwortung pro Node.

### 6.2 Projekt- und Ordnerstruktur

Das Godot-Projekt liegt im selben Repo unter `godot/` (Three.js-Code bleibt unangetastet, Daten/Doku bleiben
gemeinsam) [E]:

```
godot/
  project.godot
  addons/                    Test-Framework (gdUnit4 o. GUT), keine weiteren Plugins ohne Entscheidung
  assets/
    characters/<name>/       .glb + Texturen (Import-Einstellungen: BoneMap, LOD, Materialien)
    animations/<set>/        Animations-GLBs → AnimationLibraries (retargetet auf das Humanoid-Profil)
    environments/<venue>/    Modelle, Texturen, Decals
    audio/music, audio/sfx   OGG
  data/
    moves/*.tres  songs/*.tres  venues/*.tres  crowd/*.tres  tuning/*.tres
  src/
    autoload/                Events, Settings, SaveService, GameState (Szenenwechsel)
    core/                    Mathe-Helfer, RNG, SpatialHash
    gameplay/                MoveController, ComboManager, BeatManager, SongTimeline, HypeMeter (pure)
    characters/mosher/       mosher.tscn, mosher.gd (Bewegung), mosher_anim.gd (AnimationTree-Treiber),
                             reactions.gd (Balance, Stolpern, Fallen), foot_ik.gd
    characters/brains/       player_brain.gd, npc_brain.gd
    crowd/                   crowd_director.gd, crowd_agent.gd, crowd_lod.gd, pit_states/*.gd
    venues/                  venue.gd (Basis), basement/basement.tscn
    camera/                  pit_camera.tscn/.gd
    audio/                   music_player.gd (Uhr), sfx.gd
    ui/                      hud/, menus/, theme.tres
    session/                 pit_session.gd (verbindet alles im Level)
  tests/                     unit/ (Logik), scene/ (Szenen-Smoke-Tests)
```

### 6.3 Szenenarchitektur

```
Main (Node)                         Autoload: Events, Settings, SaveService, GameState
└─ GameState wechselt: TitleMenu.tscn ⇄ PitLevel (Venue-Szene) ⇄ Results.tscn

Basement.tscn (venue.gd, VenueDef-Resource)
├─ WorldEnvironment (Tonemapping, Glow, SSAO, Volumetric Fog)
├─ Static (modellierte Räume, Collision, LightmapGI für statisches Licht)
├─ StageRig (Lichter: SpotLight3D mit Volumetrie, Strobe, Washes; reagiert auf Beat-/Sektions-Signale)
├─ Band (4 Mosher-Instanzen mit Band-Brain)
├─ CrowdDirector (Agentendaten, Spawn, Tiers, Pit-Zustände)
│   ├─ TierA/  Mosher-Instanzen (volle Qualität)
│   ├─ TierB/  Mosher-Instanzen (vereinfacht)
│   └─ TierC/  günstige Figuren (LOD/Sichtbarkeitsbereiche, später ggf. MultiMesh)
├─ Player (Mosher + PlayerBrain)
├─ PitCamera
├─ PitSession (Move/Combo/Beat/Hype verbinden, Signale an HUD)
├─ MusicPlayer (AudioStreamPlayer + Uhr)
└─ HUD (CanvasLayer)
```

### 6.4 Charakterarchitektur

```
Mosher.tscn  (CharacterBody3D, mosher.gd)
├─ CollisionShape3D (Kapsel r ≈ 0,3 m)
├─ ContactArea (Area3D, etwas größer: Körperkontakt/Impulse an Nachbarn)
├─ Model (Figur-GLB)
│   └─ Skeleton3D
│       ├─ FootIK (SkeletonModifier3D: Zwei-Knochen-IK + Boden-Raycast, Foot Locking)
│       ├─ LookAt (Kopf zum Ziel: Band, Spieler, Gegenüber)
│       └─ PhysicalBoneSimulator3D (Teil-Ragdoll für Treffer/Fallen – nur Tier A)
├─ AnimationPlayer (Libraries: locomotion, footwork, arms, kicks, reactions, crowd, band)
├─ AnimationTree (siehe 7.1)
├─ Brain (PlayerBrain | NpcBrain)
└─ Reactions (Balance-Wert, wählt Stagger/Stumble/Fall/Get-up)
```

### 6.5 Systeme

| System | Godot-Umsetzung |
| --- | --- |
| Player Controller | `PlayerBrain`: Input Map → Wunschrichtung, Move-Drücke mit Puffer → `MoveController` |
| Character Movement | `mosher.gd`: Momentum-Regeln aus `MOVEMENT_TUNING` auf `velocity`, `move_and_slide()`; während Moves Root Motion |
| Animation Controller | `mosher_anim.gd`: setzt nur Tree-Parameter (Tempo, Richtung, Lean, OneShot-Requests, Ebenen-Gewichte) |
| Mosh Action System | `MoveController` (Port) + `MoveDef`-Resources; Phasen/Fenster aus Clip-Markern |
| Combo System | `ComboManager` (Port), HUD hört auf Signale |
| Collision & Interaction | Kapsel-Physik für Tier A + `ContactArea`; Kontakt-Impuls → `Reactions` (Abschnitt 7.5) |
| NPC Behaviour | `NpcBrain`: Rolle + Persönlichkeit (Energie, Stil, Mut, Rücksicht) → Wunschbewegung und Move-Auswahl |
| Crowd Behaviour | `CrowdDirector`: Pit-Zustände, Ströme, Dichte, Tier-Zuteilung, Desynchronisierung |
| Concert Location | `VenueDef`-Resource (Maße, Pit, Crowd-Zusammensetzung, Licht-Look) + Venue-Szene |
| Camera | `PitCamera` (Abschnitt 8) |
| Audio | `MusicPlayer` (Song-Uhr über `AudioServer.get_time_since_last_mix()`/Ausgabelatenz), Busse Musik/SFX/Crowd, Raumhall pro Venue |
| UI/Menüs | Control-Szenen mit gemeinsamem `Theme` (THPS-Stil aus ART_DIRECTION) |
| Save System | `SaveService`: JSON in `user://`, Version + Migration wie `SaveSystem.ts` |

### 6.6 Tests und Werkzeuge

- Unit-Tests der Logikklassen headless (`godot --headless`), Portierung der 46 Vitest-Fälle als Spezifikation.
- Szenen-Smoke-Test: Level laden, 600 Physik-Ticks mit Bot-Eingaben, keine Fehler, keine NaN-Positionen.
- CI: GitHub Actions lädt die gepinnte Godot-Version, führt Import + Tests aus (Three.js-CI bleibt).
- Messwerkzeuge im Spiel (Debug-Overlay): FPS, Frame-Zeit, Anzahl Figuren je Tier, Fußrutschen-Messung
  (Weg des Stand-Fußes während Bodenkontakt), Übergangs-Sprünge der Hüfte.

---

## 7. Charakterbewegung, Mosh-Animationen, Crowd-Dynamik

### 7.1 AnimationTree-Aufbau (Mosher)

```
BlendTree
├─ Locomotion  (StateMachine)
│   ├─ Stance   BlendSpace1D: ruhig ↔ aufgedreht (Energie); 3–4 Varianten, zufällig
│   ├─ Move     BlendSpace2D: lokale Geschwindigkeit (seitlich/vor) – Walk/Jog/Run/Sprint + Strafe; Sync an
│   ├─ Start/Stop/Pivot/Turn-in-place (Übergangsclips, ausgelöst aus mosher.gd)
│   └─ Air      (Sprung: Absprung → Flug-Loop → Landung leicht/schwer)
├─ FullBody    (OneShot bzw. StateMachine der Moves: 2-Step-Zyklus, Kicks, Akro, Push, Pogo)
├─ UpperBody   (Blend2 mit Bone-Filter ab Brustwirbel + additive Rumpfkorrektur: Arm-Moves über Footwork/Laufen)
├─ Headbang    (Add2, Filter Hals/Kopf, Gewicht aus Energie/Beat-Nähe)
├─ Lean        (Add2, additive Neigung aus Beschleunigung und Kurve)
└─ HitReaction (Add2 additive Zuckbewegungen, 4 Richtungen; schwere Treffer → Reactions-State)
```

- **Übergänge:** Kurze Crossfades (0,1–0,25 s) plus passende Übergangsclips; wo verfügbar Inertialisierung statt
  linearer Überblendung [V: Unterstützung in der gewählten Godot-Version prüfen].
- **Additiv statt Maske** für Arme über Footwork: Unterkörper und Rumpfschwung des 2-Steps bleiben erhalten (behebt A8).
- **Sync:** Locomotion-Clips mit Fußkontakt-Markierungen, Abspielrate = Ist-Tempo / Aufnahmetempo (begrenzt auf
  0,8–1,25×), Rest übernimmt Foot-IK.

### 7.2 Timing-Prinzip (Änderung gegenüber D-028)

- Gameplay bleibt Herr über **was** passiert (Eingabe, Puffer, Cancel-Entscheidung, Combo, Crash).
- **Dauer, Absprung, Landung, Treffer- und Cancel-Zeitpunkte** stehen als Marker/Method-Tracks *im Clip* und
  werden beim Laden in die `MoveDef` übernommen. Tuning nur über einen Tempofaktor je Move (Grenze ±15 %).
- Damit wird keine Aufnahme mehr auf eine fremde Dauer gezerrt (behebt A1). Die Musik bleibt Bonus.
- [O] Bestätigung nötig: D-028 sagte „Animation darf die Logik nicht bestimmen“. Der Vorschlag hält das ein
  (Logik entscheidet), übernimmt aber die Zeitwerte aus der Bewegung.

### 7.3 Animationsbibliothek (Zielbild)

| Bewegung | Technik | Empfohlene Quelle [E] | Slice |
| --- | --- | --- | --- |
| Pit-Grundhaltung (wippend, bereit), Varianten | Loops + BlendSpace1D | eigene Aufnahme / Paket | ✔ |
| Gehen/Joggen/Rennen/Sprint, Strafe, Start, Stopp, Pivot, Drehen am Platz | BlendSpace2D + Übergangsclips | professionelles Locomotion-Paket | ✔ |
| Two-Step (links/rechts, Varianten) | Zyklus, seitliche Root Motion | **eigene Aufnahme eines echten Hardcore-Tänzers** oder Animator | ✔ |
| Windmill / Arm Swing / Haymaker | Oberkörper-Ebene + additive Rumpfkorrektur | eigene Aufnahme | ✔ (einer) |
| Spinkick / High Kick | OneShot, Root Motion, Marker | Kampfkunst-Mocap (Paket/CMU im Originaltempo) | ✔ (einer) |
| Headbanging | additive Hals/Kopf-Ebene | Paket / eigene Aufnahme | ✔ |
| Schubsen geben/bekommen, Push-Moshing | OneShot + Treffer-Reaktion | Paket (Stagger/Push) | ✔ (Basis) |
| Stolpern (4 Richtungen), Gleichgewicht fangen | OneShot mit Root Motion, Richtung aus Impuls | Paket | ✔ |
| Hinfallen + Aufstehen (Bauch/Rücken) | Teil-Ragdoll → Aufsteh-Clip passend zur Lage | Paket | ✔ (einer) |
| Pogo | Loop mit echter Höhenbewegung | eigene Aufnahme / Paket | später |
| Circle Pit | Locomotion + Crowd-Strömung (kein eigener Clip nötig) | – | später |
| Andere auffangen / hochziehen | Paar-Animation mit Synchronpunkt | Paket / eigene Aufnahme | später |
| Cartwheel, Butterfly, Tornado | OneShot, Root Motion | CMU im Originaltempo, später Aufnahme | Phase 4 |
| Zuschauer: Wippen, Faust, Arme verschränkt, Jubeln, „Ohh“, Handy hoch | Loops mit Varianten | Paket / Aufnahme | ✔ |
| Band: Gesang, Gitarre, Bass, Drums | Loops | Paket / Aufnahme | ✔ (einfach) |

**Beschaffung – nur kostenlose Quellen (Owner-Vorgabe D-033, Stand der Lizenzprüfung 2026-11-24)**

| Quelle | Inhalt | Lizenz / kommerziell | Zugang | Einsatz |
| --- | --- | --- | --- | --- |
| CMU Motion Capture (BVH von B. Hahne) | 2 548 Takes, u. a. Stil-Gänge (105_33 „MachoWalk“, 142_04 „Cool“), Läufe mit Stopps/Wenden (78, 102, 128), Warte-Posen (137_41 „Strong Man Wait“), Sprünge (91, 105, 118), **Zusammenstoß zweier Personen (22_12/23_12)**, Stolpern (91_59, 104_13), Fallen (90_16, 90_18), **Aufstehen aus Bauch-/Rücken-/Seitenlage (140_*)**, Boxen, Kicks, Charleston (93, 103), Breakdance | frei für alle Zwecke inkl. kommerziell (Nennung erbeten) | Git, in der Cloud erreichbar | **Hauptquelle des Slices** |
| Mixamo | große Bibliothek generischer Clips | kostenlos mit Adobe-Konto, lizenzfrei in kommerziellen Spielen; Weitergabe als eigenständige Dateien untersagt [V: Wortlaut vom Owner prüfen] | nur Owner lokal (Login) | optionale Ergänzung; Rohdateien **nicht** ins öffentliche Repo (git-ignored), Spiel läuft ohne sie |
| Quaternius Universal Animation Library | ~120 handgekeyte Game-Clips | CC0 | Website/itch (Host nicht freigegeben) | Kandidat für Interaktionen, stilisiert |
| 100STYLE | Fortbewegung in 100 Stilen | CC BY 4.0 [V] | Zenodo (Host nicht freigegeben) | Kandidat für Gang-Stile |
| Eigene Aufnahmen mit **FreeMoCap** (Open Source) + 2–4 Webcams/Handys | Hardcore-Moves (2-Step, Windmill, Headbang, Pogo, Push) | Software frei; Aufnahmen gehören dem Owner | lokal beim Owner | beste freie Quelle für authentische Mosh-Moves |
| Bandai Namco Dataset | Stile, Kampf | CC BY-NC 4.0 – **nicht kommerziell** | – | nur Altbestand, nicht im Godot-Projekt |
| LAFAN1 (Ubisoft), AMASS/AIST++ (SMPL) | Fortbewegung, Tanz | NC/ND bzw. SMPL nicht-kommerziell | – | **nicht nutzen** |

Kostenpflichtige Optionen (nur zur Information, werden nicht genutzt): Mocap-Pakete, Move.ai/Rokoko-Abos, Animator.

Mosh-spezifische Moves ohne passende Aufnahme werden **aus echter Mocap abgeleitet** (Ausschnitte, Spiegeln,
Zeitverlauf, Kombination von Unter-/Oberkörper verschiedener Takes, Retargeting) und nur prozedural *ergänzt*
(Fuß-IK, Headbang-Additiv, Lean) – nie aus reinen Formeln gebaut.

### 7.4 Fußkontakt, Root Motion, Physik

- **Fuß-IK + Foot Locking** für alle Tier-A-Figuren: Raycast pro Fuß, Becken-Ausgleich, Sperren des Stand-Fußes
  während Kontakt-Markern. Godot bietet `SkeletonModifier3D` als Basis; je nach 4.x-Version gibt es fertige
  IK-Modifier [V: bei Versionswahl prüfen; Fallback: eigener Zwei-Knochen-Modifier – die Mathematik existiert in
  `tools/blender/authoring.py`].
- **Root Motion** (`AnimationMixer.root_motion_track`) während Moves und Reaktionen; der Spieler kann mit dem
  Faktor `steer` aus der `MoveDef` gegensteuern. Fortbewegung bleibt code-gesteuert (direktes Spielgefühl), die
  Animation passt sich über Sync und IK an.
- **Physik hybrid:** Kapseln + `move_and_slide` für Tier A, Impulse über `ContactArea`. Teil-Ragdoll
  (`PhysicalBoneSimulator3D`) nur für Fallen und schwere Treffer, mit Rückblende in einen Aufsteh-Clip, der zur
  Lage passt (Bauch/Rücken). Physik-Engine: Godot Physics oder das eingebaute Jolt [V: ab 4.4 wählbar; im Slice
  vergleichen].

### 7.5 Kontakt- und Reaktionsmodell

- Jeder Mosher hat **Masse, Balance (0…1) und Standfestigkeit** (aus Körpertyp/Rolle).
- Kontakt liefert einen Impuls aus Relativgeschwindigkeit und Massenverhältnis. Stufen:
  1. **absorbieren** (additive Zuckbewegung, Rumpf weicht aus),
  2. **Ausfallschritt** (Stagger-Clip in Impulsrichtung, Root Motion),
  3. **Stolpern** (längerer Clip, Balance sinkt, Arme fangen),
  4. **Fallen** (Teil-Ragdoll → Aufstehen; andere helfen evtl. hoch – später).
- Balance erholt sich über Zeit; der Spieler sieht den Zustand an der Körpersprache, nicht an Balken.
- Die bisherigen Gameplay-Regeln (Crash bei großem Move ins Gedränge, wackelige Landung) werden auf dieses Modell
  abgebildet, nicht ersetzt.

### 7.6 Crowd-Dynamik

**Qualitätsstufen (Tiers)**

| Tier | Wer | Anzahl (Slice) | Körper | Animation | Physik |
| --- | --- | --- | --- | --- | --- |
| A | Spieler + Leute im Pit nahe am Spieler | 1 + 6–10 | volle Figur | voller AnimationTree, Fuß-IK, Reaktionen, Teil-Ragdoll | Kapsel, Impulse |
| B | Pit-Rand und Wand | ≈ 30 | volle Figur, LOD | vereinfachter Tree (Loops + Reaktionen), kein IK, ggf. reduzierte Update-Rate | nur Director (Abstoßung) |
| C | hinten, Ränge | ≈ 30–100 (Venue-abhängig) | LOD/Sichtbarkeitsbereiche | Loops mit 15–30 Hz | keine |

Figuren wechseln das Tier nach Abstand und Relevanz (mit Hysterese); ein Tier-Wechsel tauscht nicht das Modell,
sondern Tree-Komplexität, Update-Rate und Physik.

**Pit-Zustände** (vom `CrowdDirector` aus Song-Sektion, Energie und Zufall gewählt): normales Moshen, Two-Step-
Kreis, Circle Pit (tangentiale Strömung um das Zentrum), Push-Wellen/Pogo, Breakdown-Öffnung (Pit wird größer,
Ninjas kommen rein), Wall of Death (später). Zustände steuern Zielpositionen, Strömungen, Dichte und welche Moves
NPCs wählen.

**Organik statt Gleichschritt** (behebt A5): jede Figur hat Persönlichkeit (Energie, Takt-Treue, Stil, Rücksicht),
eigene Phase und Tempo-Abweichung (±8 %), wählt aus Clip-Varianten, reagiert verzögert nach Abstand (Wellen),
schaut zu interessanten Ereignissen (Look-At). Musik-Bezug als Tendenz, nicht als Raster.

**Steuerung der NPCs:** Social-Force/Boids im Director (Ziel, Abstoßung, Strömung, Ausweichen vor dem Spieler)
mit dem vorhandenen Raster-Hash; Tier-A-NPCs übergeben ihre Wunschgeschwindigkeit an ihren `CharacterBody3D`.

### 7.7 Performance-Budget [E] (Messung auf Owner-Hardware entscheidet)

| Posten | Ziel |
| --- | --- |
| Bildrate | stabile 60 FPS auf festzulegender Referenz-Hardware [O] |
| Figuren | Spieler ≈ 25–35 k Dreiecke, Tier A ≈ 15–20 k, Tier B ≈ 8–10 k, Tier C ≈ 2–4 k |
| Draw Calls pro Figur | 1–2 (Kleidung in einen Mesh/Atlas zusammenführen statt 5–6 Materialien) |
| Knochen | ≈ 50–70 inkl. Finger (Tier B/C ohne Finger-Animation) |
| Animation | Tier A jeden Frame, Tier B jeden 2. Frame weiter weg, Tier C 15–30 Hz |
| Physik | ≤ 12 Kapsel-Körper aktiv, Ragdoll max. 2 gleichzeitig |

Godot skinnt auf der GPU; der CPU-Aufwand liegt bei AnimationTree-Auswertung und Skripten [V: im Slice messen].

---

## 8. Spielersteuerung und Kamera

> **Verbindlich ist jetzt [CONTROLS.md](CONTROLS.md) (D-034).** Der folgende Text war der Vorschlag vor der Owner-Entscheidung.

**Steuerung**
- Input Map: `move_*` (Stick + WASD), `sprint`, `footwork`, `arms`, `kick`, `acro`, `pause`, Menüaktionen;
  Belegung wie heute (Q/E/R/Space, X/Y/B/A). Deadzones pro Aktion.
- Neu laut Vision: **Ausweichen** (kurzer Sidestep/Dodge), **Sprung**, **Interaktion** (Schubsen / jemanden
  hochziehen, kontextabhängig). [O] Vorschlag: Interaktion auf eine Schultertaste (RB/F), Sprung/Ausweichen
  über bestehende Tasten nach Situation – Entscheidung des Owners, keine eigenmächtige Neubelegung.
- Momentum-Regeln aus `MOVEMENT_TUNING` bleiben, aber: Drehungen werden von Turn-/Pivot-Clips getragen
  (Drehrate begrenzt, dafür kurze, kräftige Wendeanimation), Anlauf und Abbremsen haben eigene Clips.
- Eingabe in `_physics_process` (60 Hz fest), Puffer 0,3 s und Cancel-Fenster wie heute.
- Reaktionszeit-Ziel: sichtbare Reaktion ≤ 100 ms nach Tastendruck (≤ 6 Frames).
- Getestet mit Tastatur **und** Gamepad auf echter Hardware (Owner) – Checkliste in Gate B.

**Kamera** (D-029 bleibt: feste Blickrichtung zur Band)
- `PitCamera`: folgt mit kritisch gedämpfter Feder, kleiner Vorausblick in Laufrichtung, `SpringArm3D` gegen
  Decke/Wände, Zoom-out bei großen Moves/Breakdowns, Shake nach „Trauma“-Modell, FOV-Kick bei Drops.
- Verdeckende Figuren zwischen Kamera und Spieler werden per Dither-Shader durchsichtig statt ausgeblendet.

---

## 9. Wiederverwendung vorhandener Assets und Inhalte

| Bestand | Wiederverwendung in Godot |
| --- | --- |
| Gameplay-Logik und Tuning-Werte | Port nach GDScript, Werte 1:1 als Startpunkt |
| Moves (`moves.ts`), Venue (`venues.ts`), Song-Metadaten | als `.tres`-Resources übernehmen (Konverter-Skript) |
| Tests | als Spezifikation der portierten Logik |
| `char_*.glb` | Import für den technischen Slice (Retargeting, Tiers, Performance); ersetzen, sobald neue Figuren da sind |
| `anims.glb` | nur Platzhalter; Kicks/Akro aus CMU **neu exportiert in Originaltempo ohne Pose-Matching** |
| Blender-Figurenpipeline (`mh.py`, `build_characters.py`, `variants.py`, `textures.py`) | weiter nutzbar für Varianten/Platzhalter; Exportfehler 24/30 fps beheben |
| `retarget.py`, `authoring.py`, `videomocap.py` | nicht weiterentwickeln (Godot retargetet beim Import; Video/IK ersetzt durch echte Aufnahmen); Referenz |
| Synth-Songs und SFX | **offline zu OGG rendern** (vorhandener Code in Headless-Chromium mit `OfflineAudioContext`), Metadaten (BPM, Sektionen, Drops) bleiben |
| Prozedurale Texturen (`textures.ts`) | Motive (Flyer, Banner, Bodenflecken) als PNG exportieren oder neu malen; PBR-Materialien neu |
| UI-Stil (Farben, Typo, Banner-Animationen) | in ein Godot-`Theme` übertragen |
| Doku, Entscheidungen, Spielideen | bleiben gültig, werden fortgeschrieben |
| Referenzvideos, Landmark-JSONs | nicht weiter genutzt (Herkunft ungeklärt) |

Nichts wird gelöscht; der Three.js-Stand bleibt auf seinen Branches lauffähig.

---

## 10. Priorisierter Migrationsplan

**Phase 0 – Entscheidungen und Setup** (vor jeder Implementierung)
- Owner-Entscheidungen aus Abschnitt 12.
- Godot-Version festlegen und pinnen; Godot-Binary in der Cloud-Umgebung verfügbar machen (Netzwerkfreigabe) oder
  Arbeit mit lokaler Godot-Installation des Owners vereinbaren.
- Projekt-Skelett `godot/`, Test-Framework, CI-Job.

**Phase 1 – Analyse** ✅ (dieses Dokument)

**Phase 2 – Architektur** ✅ als Konzept (Abschnitte 6–8); Details werden im Slice konkret.

**Phase 3 – Vertical Slice** (in Gates; jedes Gate endet mit einem spielbaren Build und Owner-Abnahme)

| Gate | Inhalt | Abnahmekriterien |
| --- | --- | --- |
| **A – Bewegung** | 1 Figur, neue Locomotion (Stance, Gehen–Sprint, Start/Stopp/Pivot), 2-Step, 1 Arm-Move, 1 Kick; AnimationTree, Fuß-IK, Root Motion | Fußrutschen < 3 cm pro Kontaktphase; Hüftsprung bei Übergängen < 2 cm; Clips im Originaltempo (±15 %); Owner bewertet Natürlichkeit/Kraft im Build **positiv** – sonst nicht weiter |
| **B – Steuerung + Kamera** | Momentum-Bewegung, Move-Eingabe mit Puffer/Cancel, PitCamera | Reaktion ≤ 100 ms; Tastatur + Gamepad vom Owner auf Hardware getestet; keine Kamera-Sprünge |
| **C – Look** | Basement als modellierte Szene, Bühnenlicht mit Volumetrie/Nebel, Band (einfach), Materialien | Owner-Abnahme Atmosphäre; 60 FPS auf Referenz-Hardware |
| **D – Lebendige Crowd** | 6–10 Tier-A-NPCs, ≈ 30 Tier B, Pit-Zustände (Moshen, Two-Step-Kreis, Breakdown-Öffnung), Kontakt-Reaktionen (absorbieren, Stagger, Stolpern, Fallen + Aufstehen) | keine sichtbare Synchronität benachbarter Figuren; Zusammenstöße zeigen Richtung und Gewicht; 60 FPS; Owner-Abnahme |

Gate A ist der eigentliche Qualitätsbeweis. Scheitert es, wird an Animationsquelle/-daten gearbeitet – nicht an
weiteren Features.

**Phase 4 – Gameplay-Migration** (modular, jedes System mit Tests)
1. Combo/Move/Beat/Hype-Logik + HUD → 2. Song-Wiedergabe (OGG) + SFX → 3. Menüs, Pause, Ergebnis, Save →
4. restliche Moves (Cartwheel, Butterfly, Tornado …) → 5. Crowd-Surfer, Stage-Diver → 6. weitere Location.

**Phase 5 – Qualitätssicherung**: Checkliste aus dem Auftrag (Animationsqualität, Übergänge, Steuerung, Crowd,
Kollisionen, Performance, Look, Feature-Vollständigkeit gegen Abschnitt 1.2) mit Messwerten aus dem Debug-Overlay
und Owner-Playtests.

---

## 11. Größte technische Risiken

| # | Risiko | Wahrsch. | Auswirkung | Gegenmaßnahme |
| --- | --- | --- | --- | --- |
| R1 | Animationen bleiben unbefriedigend, weil passende Hardcore-Moves nirgends fertig existieren | hoch | sehr hoch | eigene Aufnahmen (Mehrkamera-Mocap) bzw. Animator; Gate A als Stopp-Punkt |
| R2 | Godot ist in der Cloud-Session nicht installierbar (github.com vom Proxy gesperrt [B]); ohne Binary keine Imports/Tests/Screens | sicher (heute) | hoch | Netzwerkfreigabe für die Godot-Downloads beantragen; sonst Owner testet lokal, CI auf GitHub Actions |
| R3 | Figuren erreichen kein PS3-Niveau (Haare, Kleidung, Gesichter) mit der MakeHuman-Skriptpipeline | hoch | hoch | Figuren-Weg entscheiden (Abschnitt 12): Asset-Pakete, Character-Creator-Tools, Auftrag |
| R4 | Lizenzen: Bandai CC BY-NC, Mixamo-Weitergabe im öffentlichen Repo, gekaufte Pakete, echte Bandnamen | mittel | hoch | Register pflegen, nur Assets mit geklärter Spiel-Lizenz, ggf. privates Repo/LFS für Kaufassets |
| R5 | Performance vieler geskinnter Figuren mit AnimationTree | mittel | mittel | Tiers, LOD, Update-Raten, Messung ab Gate C; Fallback Vertex-Animation + MultiMesh für Tier C |
| R6 | Teil-Ragdoll + Aufstehen wirkt glitchig | mittel | mittel | nur Tier A, nur bei schweren Treffern; Stagger/Stumble-Clips decken die meisten Fälle ab |
| R7 | API-Änderungen zwischen Godot-4.x-Versionen (IK/Modifier) | mittel | niedrig | Version pinnen, Upgrades bewusst |
| R8 | Visuelle Prüfung durch Claude in der Cloud nur eingeschränkt (kein GPU-Rendering) | hoch | mittel | Owner-Builds als Abnahme; Software-Rendering nur für Smoke-Screens |
| R9 | Umfangsausweitung (viele Locations, Interaktionen) vor gelöstem Animationsproblem | mittel | hoch | Gate-Reihenfolge einhalten |
| R10 | Musik: Synth-Platzhalter tragen keine Konzertatmosphäre; echte Musik ist Lizenzfrage | hoch | mittel | Owner-Musik privat (`user-content`), Aufnahmen befreundeter Bands mit Erlaubnis |
| R11 | Repo-Größe durch Binär-Assets | mittel | niedrig | Git-LFS-Entscheidung vor dem ersten großen Asset |

---

## 12. Entscheidungen des Owners

**Beantwortet am 2026-11-24 (D-033, D-034):** Null Budget, freie Quellen (Tabelle 7.3); Windows-PC; Godot 4.5.1;
Referenz-GPU GTX 1060; `godot/` im selben Repo, kein LFS vorerst; Timing aus den Clips bestätigt; Steuerung an
Claude delegiert → [CONTROLS.md](CONTROLS.md). Ursprüngliche Fragen zur Nachvollziehbarkeit:

1. **Animationsquelle** (wichtigste Frage): Mocap-Pakete kaufen, Mixamo nutzen, eigene Aufnahmen mit Tänzern,
   Animator beauftragen – oder Kombination (Empfehlung: Pakete für Fortbewegung/Reaktionen + eigene Aufnahmen
   für die Hardcore-Moves).
2. **Figuren-Weg:** MakeHuman-Pipeline als Platzhalter weiterführen, Figuren-Pakete kaufen, Character-Creator-
   Software, Auftrag an einen Character Artist.
3. **Zielplattform und Godot-Version:** Windows-PC (Steam?) annehmen? Aktuelle stabile 4.x pinnen.
4. **Cloud-Umgebung:** Freigabe der Godot-Download-Hosts, damit Claude Code headless importieren und testen kann.
5. **Interaktions-Eingabe:** Belegung für Schubsen/Hochziehen, Ausweichen, Sprung.
6. **Timing-Prinzip:** Zeitwerte der Moves aus den Clips (Abschnitt 7.2) bestätigen.
7. **Referenz-Hardware** für das 60-FPS-Ziel.
8. **Repo:** Godot-Projekt unter `godot/` im selben Repo (Empfehlung) oder eigenes Repo; Git LFS ja/nein.

---

## 13. Stand des Vertical Slice (2026-11-24, D-035)

Projekt: [`godot/`](../godot/README.md). Umgesetzt mit Godot 4.5.1, nur kostenlosen Quellen.

| Slice-Anforderung | Stand | Beleg |
| --- | --- | --- |
| Kleine, eigenständige Location | ✅ The Basement: Ziegel/Beton/Holz (prozedurale PBR-Materialien mit Normal Maps), Bühne mit Amps, Drums, Banner, Truss mit 4 Spots, Glühbirne über dem Pit, Rohre, Flyer, Merch-Tisch, Exit-Schild | Screenshots (Software-Rendering) |
| Vollständig steuerbarer Spieler | ✅ Momentum-Bewegung (Port), 8 Moves über die Steuerung aus CONTROLS.md, Puffer + Abbruchfenster | Unit-Tests, Smoke-Run |
| 8–12 NPCs | ✅ 10 Mosher im Pit (gleicher Körper wie der Spieler, eigene Gehirne/Persönlichkeit) + 26 Zuschauer als Pit-Wand | Smoke-Run, Screenshots |
| Idle-, Lauf-, Mosh-Animationen | 🟡 echte Mocap im Originaltempo (Stand, Gehen, Rennen, Spinkick, Tornado, Butterfly, Cartwheel, Sprung, Pogo, Armstoß, Stolpern, Fallen, Aufstehen). 2-Step = Charleston-Basis (Platzhalter), Windmill/Arm Swing/Headbang fehlen | Clip-Sheets, `test_clip_library` |
| Übergänge | ✅ Überblendung Loco ↔ Move und Move → Move (zwei Slots), Schrittphasen-gekoppelte Fortbewegung | – (Owner-Abnahme nötig) |
| Kollisionen / Körperkontakt | ✅ Kapseln (Jolt), Impulse aus Relativgeschwindigkeit und Masse, Reaktionen nach Stärke/Richtung/Balance, Pit-Wand schubst zurück | Smoke-Run: ≈ 40–48 Reaktionen in 15 s, davon 3–5 beim Spieler (Stolpern endet für den Spieler nach 0,35 s per Stick/Ausweichen) |
| Erste Mosh-Interaktionen | ✅ Schubsen (zielt automatisch), Kicks treffen Umstehende, NPCs schubsen sich und den Spieler | Smoke-Run |
| Kamera | ✅ fest Richtung Band, Federung, Vorausblick, Umschauen ±40°, nah/weit, Verdecker werden transparent | Screenshots |
| Licht/Atmosphäre | ✅ Volumen-Nebel, farbige Spots mit Lichtkegeln, AgX-Tonemapping, Glow, SSAO, Schatten (Glühbirne + 2 Spots); Musik + Crowd-Loop + Aufprall-Sounds | Screenshots |
| Stabile Performance | 🟡 CPU belegt: ≈ 2,0 ms/Frame (p95 2,7 ms) für 10 + 26 Figuren, 4,9 ms für 30 + 80 (Xeon 2,1 GHz, ohne Rendering). GPU: ≈ 650 Draw Calls, 0,8–0,9 Mio. Dreiecke – **FPS auf GTX-1060-Klasse muss der Owner messen** (HUD zeigt FPS/Draw Calls) | `tools/dev/perf.gd` |
| Fußrutschen < 3 cm | 🟡 mit Fuß-IK 0,9–2,7 cm (Gehen bis Rennen), Sprint 3,0–3,7 cm (ohne IK bis 5,8 cm) | `tools/dev/foot_slide.gd` |
| Windows-Build | ✅ `MoshPit.exe` (107 MB, PCK eingebettet) wird gebaut; das exportierte Paket läuft headless fehlerfrei (Linux-Runtime). Start unter Windows selbst: Owner (Wine läuft in der Cloud-Umgebung nicht) | Export + `--main-pack`-Lauf |

**Nicht im Slice (bewusst, Qualität vor Umfang):** Combo-/Punktesystem, HUD im THPS-Stil, Musik-Boni, Hype, Menüs,
Spielstand (Phase 4, Logik existiert im Three.js-Projekt); Windmill/Arm Swing/Headbang (brauchen Aufnahmen);
Hochziehen gefallener Personen (CMU 22_01/23_01 als Kandidat vorhanden); Crowd-Surfer, Circle Pit.

**Bekannte Schwächen (ehrlich):** Die Figuren sind weiterhin die MakeHuman-Modelle (keine Haare, keine Finger,
Kleidung ohne Normal Maps) – nicht PS3-Niveau. Der 2-Step ist stilistisch Charleston. Die Zuschauer haben nur
wenige Loops (Stand, Pogo, Jubeln). Aufstehen ist langsam (ruhige CMU-Aufnahme). Alles ist nur in
Software-Rendering gesehen; Bewegungsgefühl und GPU-Performance kann nur ein Test auf echter Hardware zeigen.

**Nächste Schritte nach Owner-Feedback:** (1) Owner spielt den Slice (Gamepad + Tastatur) und misst FPS.
(2) Eigene Aufnahmen der Hardcore-Moves mit FreeMoCap (2-Step, Windmill, Headbang, Schubser) oder Mixamo-Ergänzungen
lokal. (3) Figuren-Upgrade (Haare, Kleidung, Finger-Rig). (4) Gameplay-Migration (Phase 4).
