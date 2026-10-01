# SGHNMS Handball Social Generator

Standalone-Generator fuer Instagram-Spieltag- und Ergebnisgrafiken auf Basis der handball.net API.

## Start

```bash
npm install
npm start
```

Danach Port `3000` im Browser oeffnen.

## Bedienung

Auf der Generator-Seite:

- Startdatum waehlen
- Enddatum waehlen
- `Spieltag` oder `Ergebnisse` waehlen
- Slides generieren
- jede Grafik per `PNG herunterladen` als 1080 x 1350 px exportieren

## Background

Das eigentliche SGHNMS-Hintergrundbild wird erwartet unter:

```text
public/assets/sghnms_images/sghnms_bg.png
```

Empfohlen: `1080 x 1350 px`.

## Fonts

### Bebas Neue

Bebas Neue wird ueber `@fontsource/bebas-neue` als npm-Abhaengigkeit installiert und vom eigenen Node-Server ausgeliefert. Es gibt keine Abhaengigkeit zu Google Fonts oder zur SGHNMS-Website.

### Edo

Die Brush-Headline verwendet `Edo`. Bitte die von dir verwendete Fontdatei lokal ablegen als:

```text
public/assets/fonts/edo.ttf
```

Die Fontdatei ist nicht Bestandteil des Repositories/ZIPs.

## PNG Rendering

Der Export erfolgt mit Playwright/Chromium. Vor dem Screenshot wartet der Renderer auf `document.fonts.ready`, damit der Export nicht versehentlich mit Fallback-Fonts erzeugt wird.

## Cache

handball.net API-Daten werden derzeit fuer 5 Minuten im Speicher gecacht.
