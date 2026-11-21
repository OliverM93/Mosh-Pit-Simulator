# Mitarbeit an MOSH PIT

Dieses Projekt wird überwiegend mit Claude Code (Opus und Sonnet im Wechsel) entwickelt. Die Regeln gelten für
Menschen und KI gleichermaßen. Kurzfassung für Claude: siehe `CLAUDE.md`.

## Ablauf

1. `docs/SESSION_HANDOFF.md` und `docs/ROADMAP.md` lesen – was ist der aktuelle Stand, was ist der nächste Schritt?
2. Branch von `main` anlegen: `feature/<thema>`, `fix/<thema>` oder `docs/<thema>`
   (Beispiele: `feature/stage-diver`, `fix/animation-transition`, `docs/audio-guide`).
   Claude-Code-Cloud-Sessions arbeiten auf ihrem vorgegebenen `claude/<name>`-Branch.
3. In kleinen, thematischen Commits arbeiten.
4. Vor dem PR: `npm run check` (Typecheck + Tests + Build) muss grün sein; Feature im Browser angespielt.
5. Pull Request gegen `main` mit Beschreibung und durchgeführten Tests (Template wird automatisch geladen).
6. **Merge erst nach Freigabe durch den Owner.**

## Commit-Messages

[Conventional Commits](https://www.conventionalcommits.org/), Englisch, Imperativ:

```
feat(moves): add stage dive from the stage edge
fix(audio): keep noise buffer offsets non-negative
docs: update roadmap after phase 2 polish
```

Typen: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `ci`.

## Code

- TypeScript strict, keine `any`, `import type` für Typen.
- Gameplay-Logik (`src/gameplay`, `src/audio/SongTimeline.ts`, `src/data`) bleibt frei von Three.js und DOM.
- Tuning-Werte in die vorhandenen Tuning-Objekte (`SCORING`, `MOVE_TUNING`, …), nicht inline.
- Neue Logik → neue Tests in `tests/`. Tests laufen in Node ohne Browser.
- Kommentare erklären das *Warum*. Englisch.

## Inhalte hinzufügen

| Was | Wo | Doku |
| --- | --- | --- |
| Move | `src/data/moves.ts` + Clip in `src/animation/clips.ts` | `docs/COMBO_SYSTEM.md` |
| Signature-Combo | `src/data/comboBonuses.ts` | `docs/COMBO_SYSTEM.md` |
| Song | `src/data/songs/` | `docs/AUDIO_AND_MUSIC.md` |
| Venue | `src/data/venues.ts` | `docs/GAME_DESIGN.md`, `docs/ART_DIRECTION.md` |
| Tastenbelegung | `src/input/bindings.ts` | `README.md` (Steuerung) |

## Assets und Lizenzen

Keine fremden Songs, Samples, Modelle, Texturen oder Fonts ohne geklärte Lizenz. Jede externe Quelle wird in
`docs/ASSET_PIPELINE.md` mit Lizenz und Herkunft eingetragen. Kommerzielle Songs sind tabu.

## Dokumentation

Die Dokumentation ist Teil jeder Änderung: `docs/ROADMAP.md`, `docs/SESSION_HANDOFF.md`, `docs/DECISIONS.md`,
`CHANGELOG.md` und das jeweilige Fachdokument aktuell halten. Keine Features dokumentieren, die es nicht gibt.
Neue Abhängigkeiten in `docs/TECHNICAL_ARCHITECTURE.md` begründen.

## Sicherheit

Keine Secrets, Tokens oder `.env`-Dateien committen. Keine Repository-Einstellungen ohne Rücksprache ändern.
