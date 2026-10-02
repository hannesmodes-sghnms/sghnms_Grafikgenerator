# SGHNMS Handball Social Generator v11

## v11 – Match-Card neu vermessen

Diese Version verwendet die separat aus Canva gelieferten Original-Assets:

- `public/assets/canva/match-card.png` – 1036 × 211 px
- `public/assets/canva/team-tag.png` – 260 × 176 px
- `public/assets/canva/vs-divider.png` – 109 × 176 px

Die Match-Card besitzt jetzt eine eigene **176-px Content-Rail**, die in der 211-px weißen Card vertikal zentriert wird. Trapez, Uhrzeit/Ergebnis, VS und Gegner beziehen sich auf diese Rail statt auf unterschiedliche Containerhöhen.

### VS-Geometrie

Beim gelieferten `CanvaVS.png` liegt der blaue Kreis nicht im geometrischen Mittelpunkt des 109 × 176 Canvas. Der Kreis hat ungefähr die Bounding-Box `x=32..87`, `y=58..114`; sein Mittelpunkt liegt damit bei `x=59.5`, `y=86`. Das Asset wird deshalb gegenüber seiner Layout-Zone um `-5px / +2px` korrigiert.

### Bebas Neue Bold

v11 erwartet zusätzlich:

```text
public/assets/fonts/BebasNeue-Bold.ttf
```

Regular und Bold werden getrennt per `@font-face` registriert. Für Teamname, Uhrzeit, Gegner und Meta-Zeile wird echtes `font-weight: 700` verwendet; `font-synthesis: none` verhindert künstliches Browser-Bolding.

### Headline Drop

Der Edo-Headline ist der Canva-Drop-Effekt ergänzt:

- Farbe `#001f44`
- Blur `0`
- Transparenz `35` → CSS-Deckkraft ca. `65 %`
- Offset als CSS-Näherung über `8px / 8px`

Der Canva-Offsetwert `54` ist ein UI-Regler und kein direkt übertragbarer Pixelwert. Die CSS-Werte sind deshalb bewusst als Variablen im oberen Bereich von `slide.css` hinterlegt.

## Weitere benötigte eigene Assets

```text
public/assets/fonts/edo.ttf
public/assets/fonts/BebasNeue-Regular.woff2
public/assets/fonts/BebasNeue-Bold.ttf
public/assets/sghnms_images/sghnms_bg.png
```

## Start

```bash
npm install
npm start
```
