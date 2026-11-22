# MOSH PIT 2.0 – Analyse und Umsetzungsplan Prototyp

Grundlage: Konzept „MOSH PIT 2.0“ des Owners (2026-11-22). Branch: `claude/mosh-pit-2-prototype`.
Der bisherige Stand bleibt als Referenz auf `claude/laughing-bell-msxkz3` (PR gegen `main`) erhalten.
Entscheidung: D-028.

## 1. Analyse der bestehenden Implementierung

| Bereich | Ist-Zustand | Problem für das neue Konzept |
| --- | --- | --- |
| Bewegung (`Player`) | Direkte Zielgeschwindigkeit pro Frame (`approach`), Drehung per Dämpfung, Moves drosseln die Geschwindigkeit pauschal (`moveControl`) | Kein echtes Momentum, keine Kurvenradien, kein Anlauf, der die Ausführung verändert; Sprung-Parabeln auf das Beat-Raster gezielt |
| Moves (`MoveSystem`) | Eine einzige Move-Spur, Zeit = Song-Zeit, Puffer/Cancel als Nachbesserung des alten Taktmodells, Hop→Air-Konvertierung | Keine Ebenen (Arme über Footwork unmöglich), keine Absprung-/Flug-/Landephasen, Cancel-Fenster global statt pro Move-Ziel |
| Eingabe (`MoveResolver`) | Taste + Richtung → Move | Kern ist brauchbar, aber „Spielsituation“ (Tempo, Luft, laufender Move) fehlt |
| Combo (`ComboSystem`) | Feste 0,8-s-Pause bankt die Combo, Multiplikatoren voller Beat-Ratings (perfect/good/okay) | Kein sichtbarer Combo-Timer, Rhythmus-Bewertung steckt in jeder Punktzahl |
| Animation (`PlayerView`, `characters.ts`) | Eine Clip-Spur, Überblendung per `crossFadeTo`, Phase aus Move-Fortschritt | Keine Körperhälften-Ebenen, keine Locomotion-Mischung (Idle/Walk/Run hart umgeschaltet) |
| Kamera | Orbit-Kamera mit Maus, folgt nur langsam beim Rennen | Nicht „hinter dem Spieler“, reagiert nicht auf Bewegungsrichtung |
| Crowd (`CrowdSim`) | Gute Atmosphäre, Crash-Regel, Schubser | Schubser dürfen die Kontrolle nicht dauernd stören, Pit braucht mehr Platz |
| Musik (`SongTimeline`) | Präzise Takte, Abschnitte, Beatdrops | Gut – wird nur noch für Boni/Energie/Effekte genutzt |
| Grafik | Blender-Figuren (MakeHuman) mit Mocap, Venue aus Primitiven | Venue und Figuren noch nicht auf THUG2/Def-Jam-Niveau (Haare, Details, Proportionen) |

**Fazit:** Bewegung, Moves, Combo und Spieler-Animation werden neu gebaut (die alte Mechanik verhindert die
gewünschte Qualität). Song-Timeline, Audio, Crowd-Simulation, Renderer, Figuren-Pipeline und UI-Framework bleiben.

## 2. Zielarchitektur (technisch getrennt)

```
InputManager ──► FrameInput (Stick kamera-relativ, Sprint, Tasten mit Zeitstempel)
                    │
PitSession ─────────┼─► MovementController  (Momentum, Kurven, Sprint/Anlauf, Move-Einfluss)
  (headless)        ├─► MoveController      (Kategorien-Tasten → Move, Ebenen, Phasen, Cancel-Fenster, Puffer)
                    ├─► ComboManager        (Punkte, Multiplikator, Wiederholung, Combo-Timer, Banken)
                    ├─► BeatManager         (Beat-Nähe, Breakdown/Heavy, Beatdrops → Boni, Energie)
                    └─► CrowdSim            (Atmosphäre, sanfte Schubser, Crash-Risiko)
                    │ events
Render: AnimationController (Locomotion-Blend + Move-Ebene + Oberkörper-Ebene), ChaseCamera, Hud
```

- **Die Animation bestimmt nicht die Logik:** Moves haben eigene Dauer, Phasen und Fenster (Daten). Die Animation
  zeigt nur den Zustand an (Clip-Zeit = Move-Fortschritt).
- **Ebenen:** `full` (Footwork, Kicks, Akrobatik) und `upper` (Arme). Ein `upper`-Move läuft über Locomotion oder
  Footwork; Arme während Kick/Akrobatik werden gepuffert.

## 3. Prototyp-Inhalt

- Eine Location (The Basement), ein detaillierter Spieler (Blender-Figur), Third-Person-Kamera, freies Movement.
- Vier Kategorie-Tasten (hybrides System), **sechs Moves**:

| Taste | Situation | Move | Ebene | Besonderheit |
| --- | --- | --- | --- | --- |
| Footwork | immer | 2-Step | full | hält Combos am Leben, steuerbar, wechselt die Seite |
| Arms | immer | Windmill Arms | upper | überlagert Laufen und 2-Step |
| Kick | langsam | Spinkick | full | kurzer Absprung, schnell in 2-Step canceln |
| Kick | mit Anlauf (Sprint-Tempo) | Tornado Kick | full | Absprung/Flug/Landung, nutzt Momentum |
| Acro | Richtung seitlich | Cartwheel | full | Bewegung zur Seite |
| Acro | sonst | Butterfly Kick | full | Absprung/Flug/Landung, Anlauf-Bonus |

- Combo-System nach THPS: Punkte × Multiplikator, Combo-Timer, Wiederholungs-Abzug, Variation, Übergänge,
  Momentum, Landungen, Musik-Boni.
- Testsong mit Breakdowns und Beatdrops (vorhandener Synth-Song „Basement Rules“, Platzhalter bis Originalmusik).
- Nicht enthalten: Karriere, Shops, Unlockables, weitere Venues, Song-Auswahl, Free Pit.

## 4. Regeln im Detail (Startwerte, Tuning in den `*_TUNING`-Objekten)

**Movement:** Beschleunigung abhängig von Richtung (Antritt stark, Umkehr = Abbremsen), Wendigkeit sinkt mit Tempo
(Kurvenradius), Sprint baut Tempo langsam auf („Anlauf“). Moves setzen nur Faktoren: Lenkung, Tempo-Mitnahme,
Impuls nach vorn. Keine Bewegungssperre außer in der Landung schwerer Moves (kurz).

**Moves:** Jede Definition hat Dauer, Clip-Ausschnitt, Phasen (`takeoff`, `air`, `landing` als Anteile),
Cancel-Fenster (`cancelFrom` + erlaubte Kategorien), Platzbedarf, Punkte. Eingaben während eines nicht
abbrechbaren Moves werden 0,3 s gepuffert und starten exakt beim Öffnen des Fensters.

**Combo (ComboManager):**
- Move-Punkte = Basis × Wiederholung (100/75/50/25/10 %) × Übergang (Cancel im Fenster: „CLEAN“ ×1,2) ×
  Momentum (bis ×1,3 bei Sprint-Tempo) × Landung (sauber ×1,25, wackelig ×0,6) × Musik (On-Beat ×1,15,
  Breakdown ×1,5, Heavy ×2) × Ebene (Arme über Footwork: „LAYERED“ ×1,2).
- Multiplikator +1 pro Move (Wiederholungen unter 50 % zählen nicht), Variation: Bonus-Faktor beim Banken nach
  Anzahl verschiedener Kategorien.
- Combo-Timer 2,5 s: jeder Move füllt ihn wieder auf, er läuft nur ab, wenn kein Move läuft. Leer → Combo wird
  gebankt (Punkte × Multiplikator). Crash/missglückte Landung → Combo verloren.

**Musik:** keine Voraussetzung für Moves. Boni: On-Beat-Start, Breakdown-/Heavy-Multiplikator, Beatdrop-Treffer
(+1000), Crowd-Energie und Licht/Kamera-Effekte an Abschnitten und Drops.

**Crowd:** Ring mit mehr Platz, Schubser weich begrenzt (max. Verschiebung pro Sekunde); Risiko nur, wenn große
Moves ins Gedränge gehen (Crash) oder man auf Leuten landet (wackelige Landung).

**Kamera:** leicht erhöht hinter dem Spieler, folgt der *Bewegungsrichtung* (nicht der Blickrichtung des
Charakters → Spins drehen die Kamera nicht), sanftes Nachziehen, Maus/rechter Stick übersteuern kurz, Figur bleibt
frei (Crowd auf der Sichtlinie wird ausgeblendet).

**Animation:** Locomotion-Mischung Idle/Walk/Run nach Tempo (synchrone Phase), Move-Ebene mit kurzen
Überblendungen, Oberkörper-Ebene für Arme. Mocap-Clips werden auf den spielrelevanten Ausschnitt gekürzt
(langsame Ausholbewegungen entfallen → direkte Reaktion).

## 5. Reihenfolge

1. Movement Controller + Kamera (spielbar: rumlaufen fühlt sich gut an).
2. Move Controller (Phasen, Cancel, Puffer, Ebenen) + Animation Controller.
3. Combo Manager + HUD (Combo-Leiste, Timer, Punkte-Popups).
4. Beat Manager (Boni, Effekte), Crowd-Tuning.
5. Tests, Browser-Check, Doku.
6. Danach (eigener Schritt): Grafik-Qualität – Haare, Kleidung, Venue-Details, Licht (THUG2/Def-Jam-Referenz).

## 6. Status

Siehe `docs/SESSION_HANDOFF.md`.
