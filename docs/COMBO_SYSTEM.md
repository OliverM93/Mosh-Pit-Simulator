# Combo-System

Quellcode: `src/gameplay/ComboSystem.ts` (Scoring), `src/gameplay/MoveSystem.ts` (Ablauf, Puffer, Bails),
`src/gameplay/timing.ts` (Bewertung), `src/data/moves.ts`, `src/data/comboBonuses.ts`,
`src/gameplay/PitSession.ts` (Kontext: Sektion, Platz, Anlauf, Beatdrop). Alle Zahlen stehen in Tuning-Objekten
(`SCORING`, `MOVE_TUNING`, `SESSION_TUNING`, `TIMING_WINDOWS`, `HYPE_TUNING`) – bei Änderungen hier nachziehen.

## Move-Definitionen

| ID | Name | Eingabe | Kat. | Dauer* | Basis | Mult. | Platz | Adv. | Besonderheit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `two_step` | 2-Step | Q (neutral/zurück/seitlich) | step | 0,36 s | 40 | +0,5 | 0,6 m | – | Link, alternierend, milde Wiederholungs-Kurve |
| `crowd_push` | Crowd Push | W + Q | step | 0,5 s | 70 | +0,5 | 0,9 m | – | Link, 1,8 m vorwärts |
| `forward_arms` | Forward Arms | E (neutral/vor) | arms | 0,7 s | 120 | +1 | 0,9 m | – | Windmühle vorwärts + 2-Step |
| `side_arms` | Side Arms | A/D + E | arms | 0,7 s | 140 | +1 | 1,0 m | – | Seitliche Windmühle |
| `pick_up_change` | Picking Up Change | S + E | arms | 0,75 s | 170 | +1 | 1,0 m | – | Vorgebeugt, Arme am Boden |
| `spinkick` | Spinkick | R | kick | 0,7 s | 260 | +1 | 1,25 m | ✔ | Alternierend |
| `floorwork` | Floorwork | F (neutral/vor/zurück) | floor | 0,75 s | 220 | +1 | 1,1 m | ✔ | Tiefer Sweep |
| `cartwheel` | Cartwheel | A/D + F | floor | 0,75 s | 320 | +1 | 1,4 m | ✔ | 1,7 m seitwärts, Blick in Kamerarichtung |
| `hop` | Hop | Space | air | 0,45 s | 20 | +0,5 | 0,6 m | – | Link, Absprung für Air-Moves |
| `tornado_kick` | Tornado Kick | Space → R | air | 0,8 s | 450 | +1 | 1,3 m | ✔ | Nur in der Luft |
| `butterfly_kick` | Butterfly Kick | Space → F | air | 0,85 s | 520 | +1 | 1,4 m | ✔ | Nur in der Luft |

\* *Natürliche* Dauer. Die echte Dauer ist `max(1, round(dauer / puls))` ganze Pulse und endet auf dem Raster.
Bei 165 BPM (Puls 0,364 s) dauert ein Spinkick 2 Pulse, im Breakdown (Puls 0,727 s) 1 Puls.

Felder pro Move (`MoveDefinition`): `input` (Knopf, Richtungen, Luft), `durationSec`, `score`, `multiplierGain`,
`repetition` (Faktoren für 1., 2., 3. … Nutzung in derselben Combo), `cancelAt`, `moveControl`, `rootMotion`,
`space`, `advanced`, `difficulty` (Hype), `jumpHeight`, `faceCamera`, `clip`, `alternate`, `link`, `hint`.

## Ablauf einer Combo

```
Druck ──► Timing-Bewertung ──► Miss? ──ja──► BAIL (Combo weg, Sturz 2 Pulse / min. 0,7 s)
                                  │nein
                                  ▼
            läuft ein Move?  ── nein ──► sofort starten
                │ ja
                ├─ Fortschritt ≥ cancelAt ──► abbrechen, sofort starten (Clean Link)
                ├─ Ende ≤ 1,05 Pulse entfernt ──► puffern, startet exakt am Ende (Clean Link)
                └─ sonst ──► ignorieren (keine Strafe)

Kein Move aktiv länger als max(0,55 s; 1,5 Pulse) ──► Combo wird kassiert
```

Bodenmoves werden beim Start gewertet, Hop und Air-Moves bei der Landung.

## Timing-Bewertung

Abstand des Tastendrucks (Event-Zeitstempel, latenzkorrigiert) zum nächsten Puls.
Fenster = `min(Anteil × Pulsintervall, Obergrenze)`:

| Bewertung | Anteil | Obergrenze | Punkte-Faktor | Multiplikator-Bonus | Hype |
| --- | --- | --- | --- | --- | --- |
| Perfect | 14 % | 65 ms | ×1,5 | +0,5 | 6 % × Schwierigkeit |
| Good | 27 % | 120 ms | ×1,2 | +0,25 | 4 % × Schw. |
| Okay | 40 % | 180 ms | ×1,0 | – | 1,5 % × Schw. |
| Miss | darüber | – | Bail | – | −30 % (Bail) |

Beispiel 165 BPM (Puls 364 ms): Perfect ±51 ms, Good ±98 ms, Okay ±146 ms, Miss = „auf dem Offbeat“.

## Punkte-Formel

```
movePunkte = rund5( basis
              × timing            (1,5 / 1,2 / 1,0)
              × wiederholung      (move.repetition[n-te Nutzung])
              × sektion           (advanced: Chorus 1,1 · Breakdown 1,5 · Heavy 2,0 | basic: Chorus 1,1)
              × cleanLink 1,1     (verkettet ohne Lücke, nicht beim 1. Move)
              × switchUp 1,1      (andere Kategorie als der vorige Move)
              × anlauf 1,25       (nur advanced, nach Sprint)
              × cramped 0,5       (≥ 2 Personen im Platzradius × 0,8)
              × landung           (Clean 1,2 · Sketchy 0,5; nur Air-Moves außer Hop)
              × frenzy 2 )

multiplikatorZuwachs = (wiederholung ≥ 0,5) ? move.multiplierGain + timingBonus : 0

kassiert = rund( pool × max(1, multiplikator) × stilMix × variety )
  stilMix: 3 Kategorien ×1,15 · 4 ×1,3 · 5 ×1,5
  variety: ≥ 6 verschiedene Moves ×1,2
```

**Zusätzliche Pool-Boni** (werden mit multipliziert):

| Bonus | Bedingung | Wert |
| --- | --- | --- |
| Signature-Combo | letzte Moves = definierte Folge | 400–3000 |
| Perfect ×5 / ×10 / ×20 | Perfect-Serie (über Combos hinweg, Reset bei Nicht-Perfect/Bail) | 250 / 750 / 2000 |
| DROP HIT | Perfect-Move ≤ ½ Puls an einem Beatdrop | 1000 |
| Breakdown-/Heavy-Bonus | Sektion beginnt während einer laufenden Combo | 500 |

## Warum Abwechslung gewinnt

- Wiederholungs-Kurven fallen schnell (Spinkick: 1 → 0,7 → 0,45 → 0,25 → 0,1).
- Ab Faktor < 0,5 wächst der Multiplikator nicht mehr, Hype nur noch zu 20 %.
- Stil-Mix und Variety multiplizieren die ganze Combo.
- Test `tests/ComboSystem.test.ts` sichert ab: sechs verschiedene Moves > 3 × sechs gleiche.

## Signature-Combos (`src/data/comboBonuses.ts`)

| Name | Folge | Bonus |
| --- | --- | --- |
| BASEMENT CLASSIC | 2-Step → Forward Arms → Spinkick | 400 |
| SPARE CHANGE | Forward Arms → Side Arms → Picking Up Change | 600 |
| CLEAR THE FLOOR | Crowd Push → Spinkick → Floorwork | 700 |
| GYM CLASS HERO | Cartwheel → Floorwork → Butterfly Kick | 1200 |
| PIT NINJA | Spinkick → Tornado Kick → Butterfly Kick | 1500 |
| HARDCORE HISTORY | 2-Step → Forward Arms → Spinkick → Butterfly Kick → Cartwheel → 2-Step | 3000 |

## Bail

Auslöser: Miss-Bewertung bei einem Druck (auch gepuffert). Folgen: Combo-Pool verloren (wird als „BAILED! −X“
angezeigt), Hype −30 % bzw. Frenzy-Ende, Perfect-Serie zurückgesetzt, Sturz-Animation, Eingaben gesperrt für
max(0,7 s; 2 Pulse), Crowd reagiert mit „Ohh“.

## Erweiterbarkeit

- **Neuer Move:** Eintrag in `MOVES` + Clip in `src/animation/clips.ts`. Resolver, Scoring, HUD-Liste und Hilfe-Seite
  nutzen die Daten automatisch. Test `tests/animation.test.ts` prüft, dass jeder Move einen Clip hat.
- **Neue Signature-Combo:** Eintrag in `NAMED_COMBOS`.
- **Neue Situations-Boni:** Feld in `MoveScoreContext` + Faktor in `SCORING`, in `PitSession.onMoveStart` befüllen.
- **Balancing:** nur über die Tuning-Objekte; danach `npm test` (Balance-Annahmen sind in Tests fixiert).
