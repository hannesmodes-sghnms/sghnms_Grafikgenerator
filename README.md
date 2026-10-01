# SGHNMS Handball Social Generator

Initialer MVP für automatische Instagram-Spieltag- und Ergebnisgrafiken auf Basis der handball.net API.

## Start

```bash
npm install
npm start
```

Danach Port 3000 öffnen.

## Funktionen

- Start- und Enddatum
- Dropdown `Spieltag` / `Ergebnisse`
- automatische Gruppierung in Heim- und Auswärtsslides
- Heimspiele zusätzlich nach Halle gruppiert
- Ergebnis-Slides nach Datum gruppiert
- Preview im Browser
- PNG-Download pro Slide via Playwright
- 5 Minuten API-Cache

## Wichtige Dateien

- `config.js`: Team- und Hallen-Mapping
- `server.js`: handball.net API, Slide-Logik und PNG-Export
- `public/slide.css`: Layout der Social-Grafik
- `public/styles.css`: Generator-Oberfläche

Die Initialversion nutzt einen CSS-Hintergrund. Der exakte Vereins-Hintergrund kann als nächster Schritt eingebaut werden.
