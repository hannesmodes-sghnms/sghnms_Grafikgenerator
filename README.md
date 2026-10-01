# SGHNMS Handball Social Generator v6

Erzeugt Spieltags- und Ergebnisgrafiken aus dem handball.net Vereins-Spielplan.

## v6: feste Canva-Geometrie

Diese Version arbeitet nicht mehr mit einem frei responsiven Slide-Layout. Die wesentlichen Elemente liegen auf festen Koordinaten der 1122 × 1402 Canva-Vorlage:

- Headline: feste Box und feste Rotation
- Meta-Bar: feste Position
- Match-Stack: fester Startpunkt
- Match-Card: Canva-Asset in Originalproportionen
- bei mehreren Spielen wird die komplette Karte skaliert, nicht jede Spalte separat

Damit bleiben Teamfeld, Zeitblock, VS-Trenner und Gegnerblock proportional zusammen.

## Designfarben

- Trapez / Meta-Bar: `#001f44`
- Ergebnis: `#bf0b0f`
- Zeit: `#5f5f61`

## Enthaltene Canva-Assets

- `public/assets/canva/slide-bg.png`
- `public/assets/canva/meta-bar.png`
- `public/assets/canva/match-card.png`
- `public/assets/canva/team-tag.png`
- `public/assets/canva/vs-divider.png`
- `public/assets/canva/meta-dot.png`

## Eigene Assets

Empfohlen / erwartet:

- `public/assets/fonts/edo.ttf`
- `public/assets/sghnms_images/sghnms_bg.png`

Wenn `sghnms_bg.png` vorhanden ist, wird dieses als primärer Hintergrund verwendet. Das extrahierte Canva-Background dient als Fallback.

## Start

```bash
npm install
npm start
```

Danach Port 3000 öffnen.

## Font-Fix v7

Bebas Neue wird nicht mehr über `@fontsource` eingebunden. Die Slide-HTML lädt die Schrift ausschließlich über `@font-face` aus `public/assets/fonts/`. Dadurch kann im Browser unter **Rendered Fonts** eindeutig `Bebas Neue` geprüft werden.

## v8 – Canva-Feinjustierung Uhrzeit / VS

- Uhrzeit auf die Canva-Größe `133.727 px` angehoben.
- `UHR` auf `63.3008 px` gesetzt und vertikal enger an die Uhrzeit gezogen.
- Zeitfarbe exakt auf `#545454` gesetzt.
- VS-Asset um 11 px an die originale horizontale Position verschoben.
- `Vs` nutzt jetzt die aus dem Canva-Editor ausgelesene Textbox innerhalb des Original-Assets (`38.25 px`).
- Restliches Kartenlayout bleibt gegenüber v7 unverändert.
