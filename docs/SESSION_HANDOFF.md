# Session-Handoff

Kurz und praktisch. Nach jeder größeren Aufgabe aktualisieren (älteren Stand überschreiben, nicht anhängen).

## Stand: 2026-11-21 – Phase 2: echte Figuren im Spiel

**Branch:** `claude/laughing-bell-msxkz3` (Setup + Phase 1) → PR gegen `main` (wartet auf Freigabe des Owners).
`main` enthält nur den leeren Initial-Commit.

## Zuletzt erledigt

- **Geskinnte Blender-Figuren im Spiel (D-027):** Spieler, Crowd und Band nutzen `public/models/*.glb`
  (`src/render/characters.ts`, `SkinnedCrowdRenderer.ts`, `PlayerView`). Retargeting-Fehler behoben (Oberkörper,
  Blickrichtung, Boden, Bail-Clip), verdeckte Körperflächen entfernt, Crowd-LOD → ≈ 1,0 Mio. Dreiecke/Frame.
- **Groove-Modell (D-026):** Moves in natürlicher Länge, Timing nur Bonus, Crash statt Miss-Bail.

- **Owner-Feedback nach dem Anspielen:** Synth-Musik schlecht (Originalmusik folgt), Takt-Drücken viel zu schnell,
  echte Songs haben Tempowechsel → Rhythmus-Mechanik wird überdacht (Entscheidung offen). Grafik/Animationen
  müssen deutlich besser und flüssiger werden.
- Texturen + Gesichter für die Blender-Figur (`tools/blender/textures.py`), saubere Kleidungsschnitte.
- **Figuren-Pipeline in Blender (D-025):** `tools/blender/` baut aus MakeHuman (CC0) + CMU-Mocap alle Figuren.
- Eigene Songs (`public/user-content/songs.json`, Auto-BPM) – Code/Tests fertig, Browser-Test + Doku offen.

- Grafikstufen PS1/PS2/HD (D-024), echte Bandnamen auf Merch/Flyern (D-023).

- Figuren-Overhaul (D-022): Low-Poly-Fighter-Look, Outfit-Katalog, Atlanten; README-Screenshot erneuert.

- Repo eingerichtet: Vite/TS/Vitest/Three.js, CI (`.github/workflows/ci.yml`), PR-Template, komplette Doku.
- Phase-1-Prototyp spielbar: Basement-Venue, 3 Synth-Songs, 11 Moves, Combo/Hype/Timing, Crowd, PS1-Renderer,
  HUD/Menüs/Ergebnis, Arcade + Free Pit, Save-System.
- Verifiziert: `npm run check` grün (43 Tests), Browser-Smoke-Test (Headless Chromium/SwiftShader) ohne Fehler,
  Input-Timing-Pipeline im Browser auf < 0,5 ms genau, Synth-Pegel per Offline-Rendering geprüft.

## Offene Probleme

- Nicht auf echter GPU/mit echtem Gamepad getestet (nur headless). **Wichtig:** FPS mit den neuen Figuren auf echter
  Hardware prüfen (SwiftShader: 1–2 FPS, aussagelos). Bei Problemen: Meshes pro Variante zusammenführen (D-027).
- Nach dem Bail springt die Figur aus dem Liegen in den Stand (kein Aufsteh-Clip).
- Eigene Merch-Logos (`user-content`) erscheinen nicht auf den neuen Figuren; Tempowechsel (BPM pro Abschnitt) offen.
- Bail-Härte, Timing-Fenster und Chain-Window sind ungetestete Erstwerte → Playtest nötig.
- Siehe „Bekannte Probleme“ in `docs/ROADMAP.md`.

## Nicht abgeschlossen / nicht begonnen

- Phase 2 (Polish), 3 (Progression), 4 (Content), 5 (Polish) – siehe Roadmap.
- Repository-Einstellungen: Branch Protection für `main` ist **nicht** eingerichtet (über die verfügbaren Tools nicht
  möglich). Owner: GitHub → Settings → Branches → Regel für `main`: PR erforderlich, Status-Check „Typecheck · Test ·
  Build“ erforderlich.
- Lizenz: bewusst offen (Owner-Entscheidung).

## Nächster empfohlener Schritt

**Aktuell:** Owner spielt mit den neuen Figuren an (`git pull`, `npm install`, `npm run dev`) und meldet FPS + Eindruck.
Danach: Aufsteh-Clip nach Bail, Tempowechsel in Songs, eigene Songs im Browser testen.

0. **Offene Grundsatzfrage:** Zielplattform Browser oder Windows-Standalone? Bei Windows/Steam + Editor-Arbeit →
   Wechsel zu Godot 4 vor Phase 2 (Bewertung in `docs/DECISIONS.md` D-021). Nicht ohne Freigabe des Owners wechseln.
1. Owner spielt lokal an (`npm install && npm run dev`) und merged den PR.
2. Neuer Branch `feature/timing-calibration`: Kalibrierungsscreen + Tuning-Runde (siehe Roadmap Phase 2, Punkte 1–2).

## Orientierung für die nächste Session

- Einstieg: `CLAUDE.md` → `src/game/Game.ts` (Ablauf) → `src/gameplay/PitSession.ts` (Spiellogik).
- Balancing: `SCORING` in `src/gameplay/ComboSystem.ts`, `MOVE_TUNING`, `SESSION_TUNING`, `TIMING_WINDOWS`.
- Inhalte: `src/data/` (Moves, Songs, Venues, Signature-Combos).
- Debug im Browser: `window.moshpit` ist die `Game`-Instanz (z. B. `moshpit.session.combo.score`).

## Relevante Commits

- `f300691` Initial commit (leer, Basis für `main`)
- `9fd1656` chore: scaffold TypeScript + Vite + Vitest project
- `66bae10` feat(gameplay): beat timeline, moves, combo scoring, crowd sim, animation clips
- `0acda58` feat: playable Phase 1 prototype – audio, PS1 renderer, input, HUD, menus
- danach: CI + Dokumentation (siehe `git log`)
