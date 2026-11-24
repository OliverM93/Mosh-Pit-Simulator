# Steuerungskonzept (Godot-Projekt)

Stand: 2026-11-24 · Entscheidung D-034 (Owner hat die Steuerung an Claude delegiert, D-033).
Umsetzung: Input-Map-Aktionen in `godot/project.godot`, Belegungs-Presets in `godot/src/input/input_config.gd`.

## Ziele

1. **Eine Taste = eine Absicht.** Keine Akkorde (zwei Tasten gleichzeitig), keine Doppeltipps. Varianten entstehen aus
   der Situation (Stick-Richtung, Tempo, in der Luft) – das hybride Prinzip aus D-028 bleibt.
2. **Nichts blockiert unnötig.** Aktionen laufen auf getrennten Körper-Ebenen: Beine/Ganzkörper, Arme, Kopf. Arme und
   Kopf laufen über Laufen und Footwork; Sprint ist nur ein Modifikator.
3. **Hektik-tauglich.** Die wichtigsten Aktionen liegen auf den Buttons, die man ohne Hinsehen trifft (Face-Buttons,
   Schultertasten). Eingaben werden 0,3 s gepuffert und starten, sobald das Abbruchfenster der laufenden Bewegung offen ist.
4. **Gleiche Logik auf allen Geräten.** Die Tastatur bildet das Gamepad-Layout nach (Raute IJKL = Face-Buttons,
   U/O = Schultertasten), damit Tutorial, Moveliste und Muskelgedächtnis übereinstimmen.
5. **Zentral konfigurierbar.** Alle Eingaben sind benannte Aktionen; Presets und spätere eigene Belegungen ändern nur
   Daten (Godot Input Map + `user://input.cfg`), nie Gameplay-Code.

## Belegung

| Aktion | Gamepad (Xbox / PlayStation) | Tastatur „Standard“ | Tastatur „Klassisch“ (2.0) |
| --- | --- | --- | --- |
| Bewegen (analog) | linker Stick | W A S D | W A S D / Pfeiltasten |
| Sprint (halten) | RT / R2 | Shift links | Shift links |
| Springen · Akrobatik | A / ✕ | Leertaste (oder K) | Leertaste |
| Footwork (2-Step …) | X / □ | J | Q |
| Arms (Windmill, Arm Swing) | Y / △ | I | E |
| Kick | B / ○ | L | R |
| Schubsen · Interagieren | RB / R1 | O | F |
| Ausweichen | LB / L1 | U | C |
| Headbang (halten) | LT / L2 | E | X |
| Umschauen | rechter Stick | Maus (optional) | Maus (optional) |
| Kamera nah/weit | R3 | V | V |
| Pause | Start / Options | Esc | Esc |
| Moveliste | View / Share | Tab | Tab |

## Situation → Move (Auflösung)

| Taste | Situation | Ergebnis |
| --- | --- | --- |
| Springen | Stick neutral/vorwärts | Hop/Sprung (Pogo bei Wiederholung) |
| Springen | Stick deutlich seitlich | Cartwheel (Rad) |
| Kick | in der Luft (nach Springen) | Butterfly Kick (Luft-Kick) |
| Kick | Sprint-Tempo ≥ 4 m/s | Tornado Kick |
| Kick | sonst | Spinkick |
| Footwork | – | 2-Step (halten = weiter steppen, Stick lenkt) |
| Arms | Stick vorwärts | Windmill (halten = weiter) |
| Arms | sonst | Arm Swing (halten = abwechselnd) |
| Schubsen | Person liegt vor dir (≤ 1,3 m) | Hochziehen/Helfen |
| Schubsen | Person steht vor dir (Kegel ±60°, ≤ 1,3 m) | Schubser (Impuls auf die Person, Rückstoß auf dich) |
| Schubsen | halten + in die Menge laufen | Push-Moshing (Schulter voran, dauerhafter Druck) |
| Ausweichen | Stick-Richtung (neutral = zurück) | schneller Ausfallschritt, eingehende Stöße stark gedämpft |

**Änderung gegenüber 2.0 (bewusst, begründet):** Acro-Taste neutral war der Butterfly Kick. Springen ist laut Vision eine
Grundaktion und gehört auf A/Leertaste (Konvention aller 3D-Spiele). Der Butterfly Kick bleibt erreichbar – als
Luft-Kick aus dem Sprung (Springen → Kick), wie schon im Phase-1-Design (D-011 „Air-Moves aus dem Hop“). Kein Move
entfällt.

## Ebenen und Blockierregeln

| Ebene | Aktionen | Läuft über … | Wird blockiert durch |
| --- | --- | --- | --- |
| Ganzkörper (Beine) | Footwork, Kick, Springen/Akro, Ausweichen, Schubser, Hochziehen | – | Reaktion (Stolpern/Fallen); andere Ganzkörper-Moves bis zu deren Abbruchfenster |
| Arme | Arms-Moves | Stehen, Laufen, Footwork | Kick/Akro (Eingabe wird gepuffert), Reaktionen |
| Kopf | Headbang | allem | Fallen |
| Fortbewegung | Bewegen, Sprint | – | während Moves nur gedämpft (Lenkfaktor aus den Move-Daten) |

- **Ausweichen** ist die „Notbremse“: aus Laufen/Stehen sofort, aus Moves ab deren Abbruchfenster, aus einem
  Ausfallschritt (Stagger) nach 0,25 s.
- **Reaktionen** (Stagger, Stolpern, Fallen) kommen von außen und überschreiben alles; Eingaben während eines
  Sturzes verfallen, beim Aufstehen wird nicht gepuffert (kein ungewolltes Losrennen).
- **Puffer** 0,3 s für alle Aktionen, Abbruchfenster kommen aus den Clip-Markern (D-033).

> **Korrektur (D-035):** Der Schubser ist im Slice eine Ganzkörper-Bewegung (Armstoß mit Schritt aus echter Mocap,
> automatisch zur nächsten Person im Kegel gedreht). Abbruchfenster ab 0,5 s.

## Kamera und Orientierung

- Die Kamera schaut **immer Richtung Bühne** (D-029). Stick „hoch“ = zur Band – Richtungen ändern sich nie, auch nicht
  in Hektik. Das ist der Grund, die Kamera nicht frei drehbar zu machen.
- **Umschauen** (rechter Stick/Maus) dreht den Blick bis ±40° und federt beim Loslassen zurück. Die Bewegungs-
  richtungen bleiben dabei unverändert (keine Desorientierung).
- R3/V schaltet zwischen naher und weiter Kamera (Übersicht im vollen Pit).

## Konfiguration

- Default-Aktionen stehen in der Input Map (`project.godot`), Presets in `input_config.gd`; die Wahl und eigene
  Belegungen werden in `user://input.cfg` gespeichert. Ein Umbelegungs-Menü kommt mit der Menü-Migration (Phase 4);
  das Datenformat ist dafür vorbereitet.
- Stick-Deadzone 0,2, Seiten-Schwelle für „seitlich“ 0,5 (wie `MOVE_TUNING.sideDeadzone`).
