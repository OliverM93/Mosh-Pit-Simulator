# Art Direction

**Leitbild:** Ein PS1/PS2-Spiel, das man 2001 aus der Videothek geliehen hätte – dunkel, laut, schwitzig, ein
bisschen albern. Rendering-Artefakte der Ära (wackelnde Vertices, Dithering, grobe Texturen, Nebel) sind Stilmittel,
keine Fehler. Fotorealismus ist ausdrücklich kein Ziel.

## PS1/PS2-Grafikstil (umgesetzt)

| Merkmal | Umsetzung | Ort |
| --- | --- | --- |
| Niedrige Auflösung | Szene wird in ≈ 270 Zeilen gerendert, Nearest-Upscale | `Renderer.ts` |
| Vertex-Jitter | Clip-Space-Positionen werden auf das Low-Res-Raster gerundet | `ps1.ts` |
| Begrenzte Farbtiefe | 31 Stufen pro Kanal + 4×4-Bayer-Dithering | Post-Shader |
| Flat/Low-Poly | Lambert mit `flatShading`, Quader-Geometrie | `ps1.ts`, `CharacterRig.ts` |
| Nebel | `THREE.Fog` in Venue-Farbe, Sichtweite ~17 m | `SceneView.ts` |
| CRT-Anmutung | Leichte Scanlines + Vignette (dezent halten!) | Post-Shader, `styles.css` |

Nicht umgesetzt (bewusst): affines Texture-Warping (in WebGL2/GLSL ES 3.0 nicht sauber machbar), Polygon-Sortierfehler.

## Low-Poly-Anforderungen

- Charaktere im Stil später 90er-3D-Fighter (Referenz: Tekken 3 auf der PS1): **glatt schattierte** Low-Poly-Teile
  statt Quader – verjüngte Gliedmaßen (8 Segmente), V-förmiger Torso mit Brust und abfallenden Schultern, Kugelkopf
  mit schmalerem Kiefer und Hals, Fäuste, Sneaker mit dicker Sohle. Kleidung, Tattoos und Gesichter sind Textur,
  nicht Geometrie. Varianten als eigene Teile: Haare (Buzz/kurz), Bart, Cap, Cap rückwärts, Beanie, kurze/lange
  Ärmel. ≈ 1000–1500 Dreiecke pro Figur.
- Neue Teile nur mit Gameplay- oder Lesbarkeits-Nutzen.
- Umgebung: Quader, Ebenen, Zylinder mit 4–12 Segmenten. Keine Rundungen „für Schönheit“.
- Silhouette vor Detail: Spieler und Moves müssen auf 270p lesbar sein.

## Texturen

- 16–64 px, Nearest-Filter, keine Mipmaps, prozedural per Canvas: Umgebung in `textures.ts` (Beton, Ziegel,
  Holzbühne, Amp-Bespannung, Flyer, Rauch, Lichtkegel), Figuren in `characterTextures.ts`.
- Figuren nutzen **Atlanten** mit 64-px-Zellen: Shirts/Jacken (fiktive Prints, Jersey, Flanell, Varsity, Camo-Puffer,
  Hoodie), Hosen (Jeans blau/schwarz, Woodland-Camo, Cargo, Track Pants, Chinos, Jogger), Arm-Tattoos, Gesichter
  (Ausdrücke, Sonnenbrille, Hals-Tattoos), Caps. Jede Crowd-Person wählt pro Teil eine Zelle + Farbe.
- Die Vorderseite eines Teils liegt in der Zellenmitte (u = 0,5); Prints sitzen dort.
- Text auf Texturen (Banner, Flyer) bewusst pixelig.

## Beleuchtung

- Grundstimmung dunkel-violett (Ambient + Hemisphere), Nebel in fast Schwarz.
- Zwei farbige Bühnen-Washes, die auf jedem Puls „punchen“; Farben pro Venue (`look.stageColors`), wechseln pro
  Sektion. Breakdown/Heavy: Rot.
- Eine nackte Glühbirne über dem Pit (warm, flackernd) – macht den Spieler lesbar.
- Strobo: auf jedem Puls im Heavy Part und während Frenzy; Blitz bei Beatdrops und Treffern.
- Fake-Volumetrie: additive Lichtkegel aus den Bühnenstrahlern, schwenken mit der Energie. Rauch-Sprites an der Bühne.
- Bildschirm-Blitze sparsam: Perfect (weiß, schwach), Bail (rot), Frenzy (gelb), große Combos (grün).

## Charakterdesign

- Proportionen leicht überzeichnet (großer Kopf, breite Schultern), Größe ±8 % und Statur −10 … +20 % pro NPC.
- Hardcore-Dresscode nach Referenzfotos echter Bands (vom Owner bereitgestellt): überwiegend schwarze Print-Shirts,
  Caps mit flachem Schirm (auch rückwärts), Beanies, Bärte, Glatzen, Tattoo-Sleeves und Hals-Tattoos,
  Baseball-Jerseys, Flanell, Varsity- und Puffer-Jacken, Camo- und Jeanshosen, weiße Sneaker.
  Gewichtung in `randomAppearance()` (`src/data/appearance.ts`).
- **Merch und Flyer zeigen echte Bandnamen** (Owner-Entscheidung, D-023) – als reiner Text in eigener Typografie,
  zentral in `MERCH_BANDS` (`src/data/appearance.ts`) bzw. `look.posters` der Venue. **Keine Original-Logos**
  (z. B. kein Hatebreed-Flammenschriftzug) und keine Team-/Markenlogos (Yankees o. Ä.).
- Spieler: weißes „MOSH PIT“-Shirt mit rotem Print, Camo-Hose, rote Cap rückwärts, Bart, Tattoo-Sleeves, leichte
  Eigenleuchtkraft → sticht aus der schwarzen Crowd heraus.
- Band: Sänger mit Glatze, Bart und Hoodie, Gitarristen mit Box-Gitarren, Drummer sitzend mit Cap rückwärts.
- Animationen: überzeichnet, schnappend (Ease-In/Out, Overshoot), immer musiksynchron.

## Umgebungen

**The Basement (umgesetzt):** Ziegelwände, Betonboden mit Flecken und Rissen, niedrige Betondecke mit Rohren und
Lüftungskanal, Mini-Holzbühne mit gelbem Tape, Amp-Stacks, Drumkit, Monitorboxen, Backdrop-Banner mit Bandnamen,
Flyer an den Wänden, Merch-Tisch hinten, grünes EXIT-Schild.

**Geplant:** Jugendzentrum (Graffiti, Neonröhren), Konzertsaal, Club mit Barriere, Halle, Open Air (Himmel,
Zeltdach), Festival (Großbühne, Pyro, LED-Wände – weiterhin Low-Poly).

Regel: Der Pit bleibt immer der hellste, übersichtlichste Bereich. Deko gehört an Wände und Decke.

## UI-Stil

- Arcade-Overlay im THPS-Geist: kursive, geneigte Großbuchstaben (Impact-Familie, Systemfonts), harte schwarze
  Outlines/Schatten, Farben Gelb `#ffd21f`, Rot `#e8201a`, Grün `#3cff7a`, Off-White `#f4f1ea`.
- Große Zahlen links oben (Score), Song/Zeit/Sektion rechts oben, Combo + Beat-Leiste unten mittig.
- Banner („BREAKDOWN!“, „PIT FRENZY! x2“) schlagen mit Rotation und Scale ein.
- Menüs: fokussierter Eintrag als gelber Balken mit Schlagschatten, Logo leicht zitternd.
- Keine externen Fonts (Lizenz/Netz). Fallback-Fonts sehen auf Linux schmaler aus – akzeptiert.

## Visuelle Referenzen (Stimmung, nicht Vorlagen)

- PS1-/PS2-Ära-Extreme-Sports-Spiele: Menülook, Combo-Texte, Low-Poly-Charaktere.
- Flyer-Ästhetik von DIY-Hardcore-Shows: Kopierer-Kontrast, handgeschriebene Typo, „ALL AGES“.
- Echte Kellerkonzerte: rote Bühnenlampen, eine Glühbirne, Kondenswasser, Leute auf der Bühnenkante.

Keine Figuren, Levels oder Assets realer Spiele und keine Original-Logos realer Bands verwenden. Echte Bandnamen
nur als Text auf Merch/Flyern (D-023); Songs werden keiner echten Band zugeschrieben, solange sie synthetisiert sind.
