# Audio und Musik

Quellcode: `src/audio/` – `songTypes.ts` (Format), `SongTimeline.ts` (pure Zeitrechnung), `SongClock.ts`
(Audio-Uhr → Song-Zeit), `SongPlayer.ts` (Synth- und Datei-Wiedergabe), `instruments.ts` (Synth-Stimmen),
`Sfx.ts` (Effekte, Crowd-Ambience), `AudioEngine.ts` (AudioContext, Mixer). Songs: `src/data/songs/`.

## Grundsatz

Das Timing basiert **nicht auf Audioanalyse**, sondern auf Song-Metadaten: BPM, Taktart und eine Liste von
Sektionen mit Längen in Takten. Daraus berechnet `SongTimeline` Beats, Takte, Sektionen, Bewertungs-Pulse und
Events – deterministisch und ohne Browser testbar.

## BPM-, Beat- und Puls-System

- `secondsPerBeat = 60 / bpm`; Song-Zeit 0 = Beat 0 = Beginn der ersten Sektion.
- `beatAt(t)`, `timeOfBeat(b)`, `barAt(t)`, `sectionAt(t)`.
- **Puls** = Bewertungsraster, verankert am Sektionsanfang. `pulseBeats` pro Sektion (Standard: 1, in Breakdown
  und Heavy 2 = Half-Time). `pulseAt(t)` liefert Intervall, vorigen/nächsten/nächstgelegenen Puls, Versatz
  (negativ = zu früh) und Phase. `pulseBeats` muss die Taktart teilen (wird geprüft).
- Events (`beatdrop`) werden in Song-Zeit umgerechnet; `eventsBetween(von, bis)` für Frame-Abfragen.

## Musikalische Abschnitte

| Typ | Standard-Puls | Intensität | Gameplay |
| --- | --- | --- | --- |
| `intro` | 1 Beat | 0,25 | Pit etwas enger |
| `verse` | 1 Beat | 0,55 | Normal |
| `chorus` | 1 Beat | 0,70 | Alle Moves ×1,1, Banner |
| `breakdown` | 2 Beats | 0,90 | Advanced ×1,5, +500 Pool-Bonus, Pit ×1,3, rotes Licht, Banner, Jubel |
| `heavy` | 2 Beats | 1,00 | Advanced ×2, +500 Pool-Bonus, Pit ×1,4, Strobo auf jedem Puls |
| `outro` | 1 Beat | 0,35 | Ausklingen, Song-Ende → Auswertung |

Intensität, Label (z. B. „THE SLAM“), Puls und Riff sind pro Sektion überschreibbar. Zweite Breakdowns heißen
automatisch „BREAKDOWN II“.

### Besondere Events
- **Breakdown/Heavy-Start:** Bonus in die laufende Combo, Hype +12 %.
- **Beatdrop** (`events: [{ type: 'beatdrop', bar, beat? }]`): Perfect-Move innerhalb ±½ Puls → DROP HIT +1000.
  Konvention: auf den ersten Beat von Breakdowns/Heavy Parts legen.
- **Song-Ende:** Arcade → Auswertung; Free Pit → nahtloser Neustart, Score läuft weiter.

## Song-Metadaten (Format)

```ts
{
  id: 'basement_rules', title: 'Basement Rules', artist: 'Concrete Halo',   // fiktive Band
  genre: 'hardcore', bpm: 165, beatsPerBar: 4, blurb: '…',
  sections: [ { type: 'intro', bars: 4 }, { type: 'verse', bars: 8 }, … { type: 'heavy', bars: 12, label: 'THE SLAM' } ],
  events: [ { type: 'beatdrop', bar: 28 } ],
  audio: { kind: 'synth', rootNote: 38, patterns: HARDCORE }   // oder { kind: 'file', url, offsetSec }
}
```

## Aktuelle Songs (alle synthetisiert, Bands fiktiv)

Die *spielenden* Bands bleiben fiktiv: Synthetisierte Songs einer echten Band zuzuschreiben, wäre eine falsche
Zuordnung. Echte Bandnamen kommen mit echten, lizenzierten Aufnahmen (`FileSongPlayer`). Auf Shirts und Flyern
stehen bereits echte Bandnamen (D-023).

| Song | Band | Genre | BPM | Länge | Besonderheit |
| --- | --- | --- | --- | --- | --- |
| Basement Rules | Concrete Halo | Hardcore | 165 | 1:45 | 2 Breakdowns + Heavy Part |
| Spin To Win | Lowrider Tactics | Beatdown | 138 | 1:41 | Langsam, 12-Takt-Heavy „THE SLAM“ |
| Matinee Mayhem | Pocket Knife Youth | Hardcore-Punk | 188 | 1:27 | Puls überall 2 Beats (schnelle Musik, Half-Time-Tanz) |

## Synth-Musik (Platzhalter)

`SynthSongPlayer` rendert Songs aus Pattern-Tabellen (`src/data/songs/patterns.ts`):
- 16 Zeichen = ein 4/4-Takt in Sechzehnteln; Patterns loopen über die Sektionslänge.
- Drums (`kick`, `snare`, `hat`, `crash`, `tom`): `x` Schlag, `X` Akzent, `.` Pause; `openHat` für offene Hi-Hats.
- Gitarre: `0`–`9`, `a`, `b`, `c` … = Powerchord auf Halbton-Offset zum `rootNote` (Basis 36), `x` = Palm-Mute-Chug
  auf dem Grundton, `-` = halten, `.` = Pause. Zwei Gitarren L/R (verstimmt), Bass folgt automatisch.
- `lead` (optional): einstimmige Linie zwei Oktaven höher.
- Stimmen: Kick (Sinus-Sweep + Klick), Snare (Rauschen + Body), Hi-Hat/Crash (gefiltertes Rauschen), Toms,
  Gitarren (3 Sägezahn-Oszillatoren → Distortion-Amp-Bus → Cab-Filter), Bass (Säge + Sub), Lead (Square + Vibrato).
- Lookahead-Scheduler: alle 25 ms werden Noten der nächsten 150 ms **sample-genau** auf AudioContext-Zeit gelegt.
- Pegel geprüft per Offline-Rendering (RMS ≈ −10 dBFS, kein Clipping nach Limiter).

## Audio-Synchronisierung

- **Master-Uhr:** `AudioContext`. `SongClock` nutzt `getOutputTimestamp()` (was die Lautsprecher *jetzt* spielen,
  inkl. Ausgabelatenz), Fallback `currentTime − outputLatency`. Abweichungen > 50 ms führen zu Neusynchronisierung
  (z. B. nach Pause), sonst sanfte Glättung; die Frame-Zeit ist monoton.
- **Eingaben:** Tastendrücke tragen `KeyboardEvent.timeStamp` bzw. `Gamepad.timestamp`; `SongClock.timeAt(ms)`
  rechnet sie exakt in Song-Zeit um – unabhängig von der Framerate. Im Browser verifiziert: gemessener Versatz =
  tatsächlicher Versatz (< 0,5 ms Abweichung).
- **Kalibrierung:** Einstellung „Audio Offset“ (−200 … +200 ms, positiv = Spieler drückt später).
- **Start:** Song beginnt 1,2 s nach Klick (Vorlauf), Musik und Uhr teilen denselben Startzeitpunkt.
- **Pause:** `AudioContext.suspend()` friert Musik und Uhr gemeinsam ein.

## Soundeffekte (`Sfx.ts`)

Alle synthetisiert: Menü-Blips, Rating-Töne (Perfect = Doppel-Chime), Whoosh bei Kicks/Air/Floor, Körper-Impact,
Bail (Absturz-Sweep + Thud), Bank-Arpeggio (länger bei großen Combos), Bonus-Fanfare, Crowd-Jubel (Formant-Rauschen),
„Ohh“, Crowd-Ambience (folgt der Pit-Energie). Mixer: Master → Musik / SFX / Crowd → Limiter.

## Neue Songs integrieren

**Synth-Song:** Patterns in `patterns.ts` ergänzen oder wiederverwenden, Song-Eintrag in `src/data/songs/index.ts`,
Beatdrops auf Breakdown-Anfänge, `npm test` (prüft Pattern-Längen, Events im Song, headless Durchspielbarkeit).

**Eigene Audiodatei** (vorbereitet, aber noch mit keiner Datei getestet):
1. Datei nach `public/audio/songs/<id>.ogg` (Lizenz in `docs/ASSET_PIPELINE.md` eintragen!).
2. BPM exakt bestimmen; `offsetSec` = Sekunden vom Dateianfang bis Beat 1 des ersten Taktes.
3. Sektionen in Takten eintragen (Tempo muss konstant sein – Tempowechsel werden noch nicht unterstützt).
4. `audio: { kind: 'file', url: './audio/songs/<id>.ogg', offsetSec }`.
5. Im Free-Pit-Modus mit Perfect-Quote prüfen, ggf. `offsetSec` nachjustieren.

## Grenzen / offene Punkte

- Kein Tempowechsel innerhalb eines Songs, keine ungeraden Taktarten getestet.
- Keine Kalibrierungsroutine (nur manueller Offset).
- Synth-Songs klingen bewusst einfach; echte Musik ist Content-Arbeit für Phase 4.
