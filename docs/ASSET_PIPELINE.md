# Asset-Pipeline

## Godot-Projekt (`godot/`, D-033: nur kostenlose Quellen)

| Asset | Quelle | Lizenz / kommerziell | Erzeugung |
| --- | --- | --- | --- |
| Figuren `godot/assets/characters/char_*.glb` | Kopie der Three.js-Figuren (MakeHuman-Basis, eigene Kleidung/Texturen) | CC0-Basis + eigene Arbeit · ja | `tools/assets/fix_glb_textures.py` (JPEG neu kodiert) |
| Animationen `godot/assets/animations/anims.glb` + `anims_meta.json` | CMU Motion Capture Database (Takes: 02_01, 09_01, 13_17, 13_29, 22_12, 76_11, 79_69, 82_08, 87_01, 88_06, 90_02, 90_05, 90_16, 91_59, 93_03, 118_10, 140_01) | frei für alle Zwecke inkl. kommerziell (Nennung erbeten) · ja | `godot/tools/anim/build_anims.py` |
| Musik `godot/assets/audio/music/basement_rules.ogg` + `.json` | eigener Synth-Song (Three.js-Projekt, `src/audio`) | eigene Arbeit · ja | `godot/tools/audio/render_audio.mjs` |
| SFX `godot/assets/audio/sfx/*.ogg` | eigene Synth-SFX (`src/audio/Sfx.ts`) | eigene Arbeit · ja | dito, auf −1 dBFS normalisiert |
| Materialien der Location | prozedural im Code (`src/venue/surfaces.gd`) | eigene Arbeit · ja | zur Laufzeit |

Nicht im Godot-Projekt: Bandai-Namco-Clips (nur nicht-kommerziell), Video-Mocap/IK-Clips (Owner-Bewertung), Mixamo
(Owner kann es lokal nutzen; Rohdateien gehören nicht ins öffentliche Repo, Ordner `godot/assets_local/` ist ignoriert).

**Größen (Git LFS, D-033):** `godot/assets` ≈ 11 MB (Figuren inkl. extrahierter Texturen ≈ 8 MB, Clips 1,2 MB, Audio 1,8 MB), größte Datei 1,6 MB (Song).
Kein LFS nötig; neu prüfen, sobald einzelne Dateien > 20 MB oder `godot/assets` > 200 MB.

## Figuren-Pipeline (Blender)

Echte Figuren entstehen per Skript in Blender (headless) aus MakeHuman (CC0) + CMU-Mocap, siehe
`tools/blender/README.md`, D-025 und D-027. Ausgabe in `public/models/`:

| Datei | Inhalt |
| --- | --- |
| `anims.glb` | Skelett (38 Knochen) + alle 36 Clips, von allen Figuren geteilt |
| `char_player.glb` | Spieler (1024er-Texturen, volle Auflösung) |
| `char_c1.glb` … `char_c8.glb` | Publikum/Band (512er-Texturen, Körper-LOD 0,4) |

Varianten sind Daten in `tools/blender/variants.py`, Clips in `CLIPS`/`KEY_CLIPS` (`build_characters.py`).
Prüfen im Browser: `viewer.html?model=player&clip=spinkick`.

## Bisheriger Stand: prozedurale Inhalte

Phase 1 enthält **keine** importierten 3D-Modelle, Texturen, Audiodateien oder Fonts. Alles wird zur Laufzeit erzeugt:

| Asset-Art | Erzeugung | Ort |
| --- | --- | --- |
| Umgebung | Primitive aus `VenueDefinition` | `src/render/VenueBuilder.ts` |
| Texturen | Canvas-2D, 16–64 px | `src/render/textures.ts` |
| Animationen | Keyframe-Daten (Quelle für die Blender-Pipeline) | `src/animation/clips.ts` |
| Musik | Web-Audio-Synthese aus Pattern-Daten | `src/audio/SongPlayer.ts`, `src/data/songs/` |
| Soundeffekte | Web-Audio-Synthese | `src/audio/Sfx.ts` |
| Fonts | System-Fonts (Impact-Familie, Courier) | `src/ui/styles.css` |
| Favicon | Handgeschriebenes SVG | `public/favicon.svg` |
| Screenshot | Aus dem Spiel aufgenommen | `docs/images/` |

Damit gibt es aktuell keine Lizenzfragen außer three.js (MIT, npm-Abhängigkeit).

## Verzeichnisstruktur für künftige Assets

```
public/                     → wird unverändert ausgeliefert (Vite), Pfade relativ: ./audio/…
  audio/songs/<song-id>.ogg
  audio/sfx/<name>.ogg
  models/<kategorie>/<name>.glb
  textures/<kategorie>/<name>.png
assets-src/                 → Quelldateien (.blend, .aseprite, Projekt-Audio), NICHT ausgeliefert
docs/images/                → Bilder nur für die Dokumentation
```

Verzeichnisse erst anlegen, wenn das erste Asset existiert.

## Dateiformate

| Art | Format | Vorgaben |
| --- | --- | --- |
| 3D-Modelle | glTF 2.0 binär (`.glb`) | Low-Poly (Figur ≤ ~600 Dreiecke), Y-up, Meter, Blick +Z, Pivot am Boden |
| Animationen | in `.glb` oder als Keyframe-Daten | Gelenknamen wie `JOINTS` in `src/animation/pose.ts`, wenn sie das Rig nutzen sollen |
| Texturen | PNG (indiziert, wenn möglich) | Zweierpotenzen, max. 128 px, Nearest-Filter, sRGB |
| Musik | Ogg Vorbis (`.ogg`), Fallback MP3 | 44,1/48 kHz, Stereo, normalisiert auf ~−14 LUFS, konstantes Tempo |
| SFX | Ogg Vorbis | Mono, kurz, ohne Stille am Anfang (Latenz!) |
| UI-Grafik | SVG oder PNG | Pixel-Look, keine weichen Verläufe |

## Namenskonventionen

- Dateien: `snake_case`, englisch, mit Kategorie-Präfix: `chr_pit_dancer.glb`, `tex_floor_concrete.png`,
  `sfx_crowd_cheer_01.ogg`, Songs nach Song-ID: `basement_rules.ogg`.
- IDs in Daten (`id: 'basement_rules'`) = Dateiname ohne Endung.
- Varianten mit Suffix `_01`, `_02`; Größen nicht im Namen.

## Externe Assets und Lizenzen

Regeln:
1. **Keine kommerziellen Songs** und keine Assets mit ungeklärter Lizenz – auch nicht „nur zum Testen“.
2. Erlaubt: selbst erstellte Inhalte, CC0, CC-BY (mit Namensnennung), explizit lizenzierte Musik von Bands mit
   schriftlicher Erlaubnis.
3. Jede externe Datei wird **vor dem Commit** unten eingetragen. Lizenztexte, falls verlangt, nach `licenses/`.
4. Keine Logos oder Designs realer Bands, Marken oder anderer Spiele ohne Erlaubnis. **Ausnahme (D-023):** echte
   Bandnamen als Text auf Merch und Flyern, gepflegt in `MERCH_BANDS` und `look.posters` – vor einer
   kommerziellen Veröffentlichung Erlaubnis der Bands einholen oder die Liste ersetzen.
5. Große Binärdateien (> 5 MB) erst nach Entscheidung über Git LFS (offener Punkt in `ROADMAP.md`).

### Asset-Register

| Datei | Quelle / Autor | Lizenz | Hinzugefügt |
| --- | --- | --- | --- |
| MakeHuman base mesh, targets, default skeleton + weights, eyes (verarbeitet zu `public/models/*.glb`) | MakeHuman / Data Collection AB | CC0 1.0 | 2026-11-21 |
| CMU Graphics Lab Motion Capture Database, BVH-Konvertierung B. Hahne (Takes in `tools/blender/build_characters.py`, `CLIPS`) | Carnegie Mellon University | frei für Forschung und kommerzielle Nutzung | 2026-11-21 |
| Bandai Namco Research Motion Dataset 1 (Kampfhaltung, „chimpira“-Walk/Run/Dash, High Kick; Kalibrierung: bow_normal) | Bandai Namco Research Inc. (Kobayashi et al. 2023, arXiv:2306.08861) | **CC BY-NC 4.0** – nur nicht-kommerziell, Namensnennung | 2026-11-22 |

| `tools/blender/video/two_step_pose.json`, `two_step_b_pose.json` (Gelenkpositionen, abgeleitet per MediaPipe Pose) | Referenzvideo vom Owner bereitgestellt (privat; Video nicht im Repo) | nur private Nutzung, Herkunft des Videos vor Veröffentlichung klären | 2026-11-23 |

> **Achtung (D-029):** Die Bandai-Clips (`stance`, `swagger`, `jog`, `dash`, `high_kick` in `public/models/anims.glb`)
> sind nur für nicht-kommerzielle Nutzung lizenziert. Vor einer kommerziellen Veröffentlichung müssen sie ersetzt
> werden (eigene Aufnahmen oder kommerziell lizenzierte Mocap).
