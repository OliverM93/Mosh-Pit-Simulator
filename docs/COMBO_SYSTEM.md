# Combo-System (Prototyp 2.0)

Stand: MOSH PIT 2.0 (D-028). Konzept und Begründung: [PROTOTYPE_2.md](PROTOTYPE_2.md).
Quellcode: `src/gameplay/ComboManager.ts` (Punkte, Timer, Banken), `src/gameplay/MoveController.ts` (Ablauf,
Phasen, Cancel-Fenster, Puffer), `src/gameplay/BeatManager.ts` (Musik-Boni), `src/gameplay/PitSession.ts`
(Kontext: Momentum, Landung, Crash), `src/data/moves.ts`. Alle Zahlen stehen in `COMBO_TUNING`, `MOVE_TUNING`,
`BEAT_TUNING`, `SESSION_TUNING`, `MOVEMENT_TUNING` – bei Änderungen hier nachziehen.

## Eingabe (hybrid)

Eine Taste pro Kategorie, Richtung und Tempo wählen den Move (erste passende Definition gewinnt):

| Taste (Tastatur / Pad) | Bedingung | Move | Ebene | Dauer | Basis | Luftphase | Cancel ab |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Footwork (Q / X) | – | 2-Step | full | 0,50 s | 50 | – | 45 % |
| Arms (E / Y) | – | Windmill Arms | upper | 0,90 s | 100 | – | 50 % |
| Kick (R / B) | Tempo ≥ 4 m/s | Tornado Kick | full | 1,05 s | 600 | 29–79 % | 86 % |
| Kick (R / B) | sonst | Spinkick | full | 0,85 s | 300 | 30–70 % | 76 % |
| Acro (Space / A) | Stick seitlich | Cartwheel | full | 1,15 s | 450 | 27–73 % | 80 % |
| Acro (Space / A) | sonst | Butterfly Kick | full | 1,15 s | 700 | 29–71 % | 82 % |

- **Ebenen:** Arms (`upper`) laufen über Laufen und 2-Step („LAYERED“). Während Kick/Acro wird Arms gepuffert.
- **Cancel-Fenster:** ab „Cancel ab“ darf der nächste Move den laufenden abbrechen (alle Kategorien erlaubt).
- **Puffer:** Ein Druck bis 0,3 s vor dem Fenster startet genau beim Öffnen; frühere Drücke verfallen.
- **Clean Link:** Start im Cancel-Fenster oder bis 0,25 s nach dem Ende des vorherigen Moves.
- **Phasen:** Absprung → Luft → Landung. Kicks/Acro werden erst bei der Landung gewertet.

## Punkte pro Move

`Punkte = Basis × Wiederholung × Faktoren`

| Faktor | Wert | Tag im HUD |
| --- | --- | --- |
| Wiederholung desselben Moves in der Combo | 100 / 75 / 50 / 25 / 10 % | REPEAT x % |
| Clean Link (nicht beim ersten Move) | ×1,2 | CLEAN |
| Momentum (Tempo beim Start / Sprint-Tempo) | ×1 … ×1,3 | MOMENTUM (ab 50 %) |
| Landung sauber / wackelig (≥ 2 Leute im Umkreis 0,6 m) | ×1,25 / ×0,6 | CLEAN LANDING / SKETCHY |
| Start auf dem Beat (±80 ms) | ×1,15 | ON BEAT |
| Sektion Chorus / Breakdown / Heavy | ×1,1 / ×1,5 / ×2 | BREAKDOWN x1.5 … |
| Arme über Footwork | ×1,2 | LAYERED |
| Pit Frenzy (Hype voll) | ×1,5 | FRENZY |

## Combo, Timer, Banken

- Jeder Move: Punkte in die Combo-Basis, **Multiplikator +1** (Wiederholungen unter 50 % zählen nicht).
- **Combo-Timer 2,5 s:** jeder Move füllt ihn auf; er läuft nur, wenn kein Move läuft. Leer → **Banken**:
  `Basis × Multiplikator × Variation` (Variation nach Anzahl Kategorien: 1 / 1 / 1,1 / 1,25 / 1,5).
- **Boni in die laufende Combo:** Breakdown-/Heavy-Start +500, Beatdrop-Treffer (Kick/Acro bis 0,3 s am Drop) +1000.
- **Bail:** riskanter Move (Kick/Acro) mit ≥ 4 Leuten im Umkreis Platz × 0,7 → Sturz (1,5 s ohne Kontrolle), die
  laufende Combo ist verloren. Der Ring unter dem Spieler zeigt den Platz (grün / gelb / rot).

## Musik

Musik ist nie Voraussetzung: Moves gehen jederzeit. Beat, Breakdowns und Drops geben nur Boni und steuern
Crowd-Energie, Licht und Kamera-Effekte.
