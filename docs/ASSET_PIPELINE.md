# Asset-Pipeline

## Aktueller Stand: keine Asset-Dateien

Phase 1 enthält **keine** importierten 3D-Modelle, Texturen, Audiodateien oder Fonts. Alles wird zur Laufzeit erzeugt:

| Asset-Art | Erzeugung | Ort |
| --- | --- | --- |
| Charaktere | Quader-Rig aus `BoxGeometry` | `src/render/CharacterRig.ts` |
| Umgebung | Primitive aus `VenueDefinition` | `src/render/VenueBuilder.ts` |
| Texturen | Canvas-2D, 16–64 px | `src/render/textures.ts` |
| Animationen | Keyframe-Daten | `src/animation/clips.ts` |
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
4. Keine Namen, Logos oder Designs realer Bands, Marken oder anderer Spiele ohne Erlaubnis.
5. Große Binärdateien (> 5 MB) erst nach Entscheidung über Git LFS (offener Punkt in `ROADMAP.md`).

### Asset-Register

| Datei | Quelle / Autor | Lizenz | Hinzugefügt |
| --- | --- | --- | --- |
| *(noch keine externen Assets)* | | | |
