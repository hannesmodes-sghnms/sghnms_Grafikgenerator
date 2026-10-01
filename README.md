# SGHNMS Handball Social Generator

Erzeugt Spieltags- und Ergebnisgrafiken direkt aus `handball.net`.

## Funktionen

- Auswahl von Start- und Enddatum
- Dropdown für **Spieltag** oder **Ergebnisse**
- Gruppierung der Slides nach Datum und Ort
- PNG-Download direkt im Browser
- 1080 × 1350 px für Instagram
- lokale Fonts / lokales Background Image

## Wichtige Asset-Pfade

Diese Dateien müssen im Projekt vorhanden sein:

- `public/assets/fonts/edo.ttf`
- `public/assets/sghnms_images/sghnms_bg.png`

Bebas Neue wird über `@fontsource/bebas-neue` lokal aus `node_modules` ausgeliefert.

## Installation

```bash
npm install
npm start
```

Server läuft dann standardmäßig auf Port `3000`.

## Hinweise zu v4

- PNG-Download wird jetzt **im Hauptfenster** ausgelöst, nicht mehr aus dem eingebetteten Preview-Frame.
- Ergebnis-Slides bekommen jetzt einen dritten Meta-Punkt:
  - bei Heimspielen die Halle (`PESTA`, `KSV-HALLE`, ...)
  - bei Auswärtsspielen `AUSWÄRTS`
- Ergebniszahlen werden in `#bf0b0f` ausgegeben.
- Textblöcke auf den Karten schrumpfen automatisch, wenn lange Gegnernamen sonst überlaufen würden.
