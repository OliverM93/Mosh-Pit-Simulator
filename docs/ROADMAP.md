# Roadmap

Einzige Roadmap des Projekts (die `ROADMAP.md` im Root verweist hierher).
Legende: ✅ erledigt · 🟡 teilweise · ⬜ offen

## Phase 1 – Core Prototype ✅ (2026-11-21)

Ziel: Ein Song ist vollständig spielbar und fühlt sich wie ein kleiner Arcade-Moshpit an.

- ✅ Projekt-Setup (TS, Vite, Vitest, Three.js), CI, Dokumentation, PR-Template
- ✅ Spielercharakter (Box-Rig) mit Bewegung, Sprint, Sprung
- ✅ Third-Person-Kamera (Maus/Stick, Raum- und Decken-Clamping, Sichtlinie frei)
- ✅ 11 Moves (Ziel ≥ 5) inkl. Air-Moves, Puffer, Cancel-Fenster, Überblendung
- ✅ Combo-System nach THPS (Pool × Multiplikator, Wiederholung, Stil-Mix, Signature-Combos, Bail)
- ✅ Beat-System aus Song-Metadaten (BPM, Beats, Takte, Sektionen, Half-Time-Puls, Beatdrops)
- ✅ Timing-Bewertung Perfect/Good/Okay/Miss
- ✅ Einfache Crowd (Pit-Wand, Dancer, Ninjas, Surfer, Band) mit Reaktionen und dynamischem Pit-Radius
- ✅ HUD (Score, Combo, Multiplikator, Beat-Leiste, Song, Restzeit, Sektion, letzte Bewertung, Hype)
- ✅ Drei synthetisierte Platzhalter-Songs, Synth-SFX
- ✅ Venue „The Basement“ im PS1-Look
- ✅ Modi Arcade + Free Pit, Ergebnisbildschirm mit Note, Highscore/Best Combo gespeichert
- ✅ Gamepad-Unterstützung (Standard-Mapping) – ⚠ noch nicht mit echter Hardware getestet

## Phase 2 – Gameplay Polish ⬜ (nächste Phase)

Priorität nach Spielgefühl:
1. ⬜ **Playtest-Runde mit echten Menschen** auf echter Hardware: Timing-Fenster, Bail-Härte, Chain-Window,
   Kamera, Lesbarkeit. Erkenntnisse in `DECISIONS.md`.
2. ⬜ Audio-Kalibrierungsscreen (im Takt tippen → Offset automatisch bestimmen)
3. ⬜ Weitere Moves: z. B. Haymaker/Windmill-Varianten, Stage Dive (von der Bühnenkante), Floorpunch, Two-Step-Varianten
4. ⬜ Bessere Übergänge: Lauf→Move-Einstiege, Landungen mit Federung, Variation in Idle
5. ⬜ Stärkere Crowd-Reaktionen: Stage-Diver-NPC, Circle-Pit-Phasen, Crowd-Surfer, die man „abfangen“ kann
6. ⬜ Mehr SFX-Varianten, Crowd-Gesänge bei Breakdowns, Ansager zwischen Songs
7. ⬜ Kamera: Zoom-out bei großen Combos, optionale Auto-Kamera, Kollision mit Decke weicher
8. ⬜ Crowd-Ausblenden mit Dither-Fade statt hartem Verschwinden
9. ⬜ ESLint + Prettier einführen (Konfiguration klein halten)
10. ⬜ Browser-Smoke-Test (Playwright) in die CI aufnehmen

## Phase 3 – Progression ⬜

- ⬜ Career Mode: Venue-Leiter vom Keller zum Festival, Ziele pro Konzert
- ⬜ Währung/Reputation aus Ergebnissen, Noten → Belohnungen
- ⬜ Unlock-System (Save-Format v2 mit Migration)
- ⬜ Charakter-Editor: Körperformen, Frisuren, Tattoos, Accessoires
- ⬜ Kleidung/Merch: Bandshirts (Print-Atlas für Instancing), Hoodies, Tanktops, Cargo, Baggy Jeans, Shorts, Schuhe, Caps/Beanies
- ⬜ Weitere Venues (Jugendzentrum, Konzertsaal, Club) mit unterschiedlichem Pit/Crowd
- ⬜ Highscore-Listen je Venue

## Phase 4 – Content ⬜

- ⬜ Weitere Songs (synthetisch oder lizenzierte Aufnahmen über `FileSongPlayer`), ggf. Tempowechsel unterstützen
- ⬜ Challenge Mode (Combo-Ziele, „5 verschiedene Moves in Folge“, Perfect-Anzahl, Song ohne Bail)
- ⬜ Weitere Charaktere und Animationen, neue Crowd-Typen
- ⬜ Open-Air-Festival und großes Hardcore-Festival
- ⬜ Schwierigkeitsgrade (engere Timing-Fenster, dichtere Crowd)

## Phase 5 – Polish ⬜

- ⬜ Grafikoptimierung, Effekte (Pyro, LED-Wände), Performance-Profiling auf schwacher Hardware
- ⬜ UI-Feinschliff, Controller-Glyphen, Menü-Sounds
- ⬜ Balancing auf Basis von Playtest-Daten
- ⬜ Optional: Code-Splitting, PWA/Offline, Deployment (z. B. GitHub Pages)

## Offene Aufgaben (projektweit)

- ⬜ Lizenz festlegen (Entscheidung des Owners; bis dahin keine LICENSE-Datei)
- ⬜ Branch Protection für `main` einrichten (siehe SESSION_HANDOFF – nur durch den Owner möglich)
- ⬜ Git LFS ja/nein, sobald große Binär-Assets kommen
- ⬜ Deployment-Ziel für spielbare Builds festlegen

## Bekannte Probleme

- Performance nur in Software-Rendering gemessen (~20 FPS in SwiftShader); echte GPU-Werte fehlen.
- Gamepad und Pointer Lock nur theoretisch/headless geprüft, nicht mit echter Hardware.
- Crowd-Mitglieder vor der Kamera verschwinden hart (kein Fade).
- `FileSongPlayer` (echte Audiodateien) ist implementiert, aber mangels Dateien ungetestet.
- Synth-Musik ist bewusst simpel; Mix nicht auf verschiedenen Lautsprechern geprüft.
- Auf Systemen ohne Impact-Font fällt die UI auf schmalere Fonts zurück.
- Song-Ende-Verzögerung (1,8 s) läuft in Spielzeit; bei sehr niedriger Framerate dauert sie real länger.

## Nächste konkrete Schritte

1. PR „Phase 1“ reviewen und mergen (Owner).
2. Lokal anspielen (`npm run dev`), Eindrücke zu Timing, Bail-Härte und Kamera sammeln.
3. Phase 2 starten mit: Kalibrierungsscreen + Tuning-Runde (Timing-Fenster, Chain-Window, Bail-Dauer).
