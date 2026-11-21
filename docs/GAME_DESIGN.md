# Game Design

Stand: Phase 1. Markierungen: ✅ implementiert · 🟡 teilweise · 📋 geplant.
Zahlen und Formeln des Combo-Systems stehen in [COMBO_SYSTEM.md](COMBO_SYSTEM.md).

## 1. Core Loop

1. Song startet, die Band spielt, der Pit wartet.
2. Spieler bewegt sich frei durch den Pit und drückt Moves **auf den Puls** der Musik.
3. Moves hintereinander bilden eine **Combo** (Pool × Multiplikator). Eine kurze Pause **kassiert** sie.
4. Ein Druck gegen den Beat ist ein **Bail**: die Combo ist verloren, der Spieler fällt hin.
5. Breakdowns/Heavy Parts: Half-Time-Puls, große Moves zählen mehr, der Pit öffnet sich.
6. Song-Ende: Ergebnis mit Note, Highscore wird gespeichert.

## 2. Bewegung ✅

- WASD/linker Stick, kamerarelativ. Gehen 2,9 m/s, Sprint (Shift/RT) 5,2 m/s.
- **Running** ✅: Wer ≥ 0,35 s sprintet und direkt danach (≤ 0,35 s) einen fortgeschrittenen Move startet, bekommt den
  Anlauf-Bonus (×1,25).
- Während eines Moves wird die Steuerung je nach Move gedämpft (`moveControl`), manche Moves haben eigene
  Fortbewegung (Crowd Push vorwärts, Cartwheel seitwärts).
- Die Crowd begrenzt den Pit: Zuschauer sind „schwer“ und schieben den Spieler sanft zurück in den Pit.

## 3. Moves und Kategorien ✅

Eingabe-Prinzip: **Knopf = Kategorie, Richtung = Variante** (wie THPS). Richtungen sind kamerarelativ.

| Kategorie | Knopf | Moves |
| --- | --- | --- |
| Step (Link) | Q / X | 2-Step (neutral/zurück/seitlich), Crowd Push (vorwärts) |
| Arms | E / Y | Forward Arms (neutral/vor), Side Arms (seitlich), Picking Up Change (zurück) |
| Kick | R / B | Spinkick (jede Richtung) |
| Floor | F / RB | Floorwork (neutral/vor/zurück), Cartwheel (seitlich) |
| Air | Space / A | Hop; in der Luft R → Tornado Kick, F → Butterfly Kick |

- **Link-Moves** (2-Step, Crowd Push, Hop) bringen wenig Punkte und nur halben Multiplikator, halten aber die Combo
  am Leben – das Gegenstück zum Manual in THPS.
- **Fortgeschrittene Moves** (Kicks, Floor, Air) profitieren von Breakdown/Heavy-Boni und Anlauf.
- **Kombinationen aus Schritten und Armen:** Die Arm-Moves tanzen mit den Beinen einen 2-Step (Clip-Design).
- „Picking Up Change“ ist eine Ergänzung zur Move-Liste aus der Projektbeschreibung (klassischer Hardcore-Move).
- Jeder Move hat Animation, natürliche Dauer, Punktwert, Multiplikator-Zuwachs, Wiederholungs-Kurve, Cancel-Fenster,
  Platzbedarf und Schwierigkeit – alles Daten in `src/data/moves.ts`.

### Übergänge ✅
- Moves dauern immer ganze Pulse und **enden auf dem Raster**; der nächste Move beginnt dadurch wieder im Takt.
- **Input-Puffer:** Ein Druck bis 1 Puls vor Ende wird vorgemerkt und startet exakt am Move-Ende.
- **Cancel-Fenster:** Ab `cancelAt` (z. B. 65 % bei Arms) darf der nächste Move sofort starten.
- Animationen werden 50–180 ms überblendet; alternierende Moves (2-Step, Kicks) werden bei Wiederholung gespiegelt.
- Ein Druck lange vor Ende eines Moves wird ignoriert (keine Strafe).

### Luft und Landung ✅
- Hop (Space) → innerhalb der ersten 80 % des Sprungs R oder F drücken: wird zu Tornado/Butterfly Kick, die
  Flugzeit verlängert sich bis zum nächsten passenden Puls.
- Bewertet wird der **Absprung**. Später Umstieg (> 55 % des Hops) oder Landung im Gedränge → **Sketchy** (×0,5),
  sonst **Clean Landing** (×1,2). Air-Moves werden erst bei der Landung gewertet.

### Platz ✅
- Jeder Move hat einen Platzbedarf (Radius). Stehen ≥ 2 Personen innerhalb von 80 % davon → **Cramped** (×0,5).
- Der Ring unter dem Spieler zeigt den freien Platz: grün > 1,2 m, gelb > 0,75 m, rot darunter. Er pulsiert im Takt.
- Große Moves stoßen Leute weg: Dancer stolpern, Zuschauer schubsen zurück.

## 4. Combo- und Score-System ✅

Kurzfassung (Details: [COMBO_SYSTEM.md](COMBO_SYSTEM.md)):
- Move-Punkte = Basis × Timing × Wiederholung × Sektion × Situations-Boni → in den **Pool**.
- **Multiplikator** wächst pro frischem Move (+1, Link +0,5, Perfect +0,5, Good +0,25).
- **Kassieren** nach 1,5 Pulsen Pause: Pool × Multiplikator × Stil-Mix × Variety.
- **Bail** bei Miss: alles weg.
- Boni: Signature-Combos, Perfect-Streaks, Beatdrop-Hit, Breakdown-Bonus, Pit Frenzy (×2).
- HUD: Score, Highscore, aktuelle Combo (Move-Namen), Pool × Multiplikator, Chain-Timer, letzte Bewertung.
- Highscore und beste Combo werden pro Song+Venue gespeichert.

## 5. Musik und Rhythmus ✅

- Songs sind Daten: BPM, Takt, Sektionen (Intro, Verse, Chorus, Breakdown, Heavy, Outro), Beatdrop-Events.
- **Puls** = Bewertungsraster. Standard 1 Beat; Breakdown/Heavy Half-Time (2 Beats). Pro Sektion überschreibbar.
- Sektionswechsel in Breakdown/Heavy: +500 in den laufenden Pool, Hype +12 %, Banner, Jubel, rotes Licht.
- Beatdrop: Perfect-Move innerhalb ±½ Puls → DROP HIT (+1000).
- Timing: Perfect / Good / Okay / Miss (Fenster skalieren mit dem Puls). Details: [AUDIO_AND_MUSIC.md](AUDIO_AND_MUSIC.md).

## 6. Hype und Pit Frenzy ✅

Das „Special-Meter“: Gute Moves füllen es (abhängig von Timing und Schwierigkeit), es fällt langsam ab, ein Bail
kostet 30 %. Voll → **PIT FRENZY**: 10 s doppelte Punkte, Crowd springt, Strobo, Farbwechsel.

## 7. Crowd ✅

| Typ | Verhalten | Status |
| --- | --- | --- |
| Zuschauer (Pit-Wand) | Stehen auf Ringen um den Pit, wippen/headbangen/Faust je nach Energie und Typ | ✅ |
| „Arms crossed“-Typ | Bewegt sich kaum, jubelt nur bei sehr großen Combos | ✅ |
| 2-Stepper / Dancer | Tanzen im Pit beat-synchron (2-Step, Arms), halten Abstand zum Spieler | ✅ |
| Pit-Ninjas | Wie Dancer, werfen Spinkicks/Floorwork | ✅ |
| Crowd-Surfer | Werden über die Köpfe Richtung Bühne getragen | ✅ |
| Band | Sänger, 2 Gitarren, Drummer, animiert je nach Sektion | ✅ |
| Stage-Diver | Springt von der Bühne in die Crowd | 📋 Phase 2 |

- **Aussehen:** Jede Person wird aus einem Katalog zusammengesetzt (Shirt/Jacke, Hose, Kopfbedeckung, Haare, Bart,
  Tattoos, Gesicht, Hautton, Größe, Statur) – Grundlage für Charakter-/Outfit-Unlocks in Phase 3.
- **Dynamische Dichte:** Der Pit-Radius „atmet“: Breakdown ×1,3, Heavy ×1,4, plus Hype.
- **Reaktionen:** Jubelwelle (Verzögerung nach Entfernung) bei großen Combos und Frenzy, „Ohh“ bei Bails,
  Schubsen bei Kontakt, Stolpern bei Treffern.
- Kollisionen: Zuschauer–Zuschauer (Raster-Hash), Spieler–Crowd (massegewichtet). Surfer und Band kollidieren nicht.

## 8. Venues

| Venue | Eigenschaften | Status |
| --- | --- | --- |
| The Basement (Kellerclub) | 13 × 13 m, Decke 3 m, Mini-Bühne, Pit-Radius 3 m, ~60 Zuschauer | ✅ |
| Jugendzentrum, kleiner Konzertsaal, Club, Halle, Open Air, Festival | größerer Pit, mehr Crowd, mehr Licht | 📋 Phase 3/4 |

Venues sind Daten (`src/data/venues.ts`): Raummaße, Bühne, Pit, Crowd-Zusammensetzung, Licht-/Nebelfarben, Poster.
Gameplay-Unterschiede entstehen über Pit-Radius, Crowd-Dichte und Raumhöhe (Kamera).

## 9. Spielmodi

| Modus | Regel | Status |
| --- | --- | --- |
| Arcade | Ein Song, höchster Score, Ergebnis + Highscore | ✅ |
| Free Pit | Song läuft in Schleife, kein Timer, kein Ergebnis | ✅ |
| Career | Vom Keller zum Festival, Geld/Reputation, Unlocks | 📋 Phase 3 |
| Challenge | Ziele wie „Combo X“, „5 verschiedene Moves in Folge“, „Song ohne Bail“ | 📋 Phase 4 |

Modi sind Regeln um die Session herum (`src/gameplay/modes.ts`: loopen, Ergebnis, Highscore, Timer).
Career/Challenge sind im Menü sichtbar, aber gesperrt.

## 10. Progression und Unlockables 📋 (Phase 3)

Geplant (noch nicht implementiert):
- Währung „Reputation“ + Geld aus Ergebnissen; Noten (S–D) bestimmen Belohnungen.
- Freischaltbar: Charaktere (Körperformen, Frisuren, Tattoos), Kleidung/Merch (Bandshirts, Hoodies, Tanktops,
  Cargo, Baggy Jeans, Shorts, Gürtel, Schuhe, Caps/Beanies), Venues, Songs, Moves, Challenges, Crowd-Typen,
  Schwierigkeitsgrade.
- Das Save-Format ist versioniert; Progression wird als eigener Block ergänzt.

Bereits vorhanden als Grundlage: Highscores, Statistiken (Songs, Moves, Perfects, beste Combo), Note im Ergebnis.
