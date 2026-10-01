# SGHNMS Handball Social Generator

Erzeugt Spieltags- und Ergebnisgrafiken direkt aus `handball.net`.

## Funktionen

- Auswahl von Start- und Enddatum
- Dropdown für **Spieltag** oder **Ergebnisse**
- Gruppierung der Slides nach Datum und Ort
- PNG-Download direkt im Browser
- feste Designfläche in **1122 × 1402 px**
- näher an der Canva-Vorlage durch eingebundene Original-Assets aus dem Export

## Assets

Bereits enthalten:

- `public/assets/canva/slide-bg.png`
- `public/assets/canva/meta-bar.png`
- `public/assets/canva/match-card.png`
- `public/assets/canva/team-tag.png`
- `public/assets/canva/vs-divider.png`
- `public/assets/canva/meta-dot.png`

Optional bzw. empfohlen:

- `public/assets/fonts/edo.ttf`

Wenn `edo.ttf` nicht vorhanden ist, greift ein Fallback auf Bebas Neue / Systemschrift.

## Installation

```bash
npm install
npm start
```

Server läuft dann standardmäßig auf Port `3000`.

## Hinweise zu v5

- clientseitiger PNG-Export bleibt erhalten, es wird **kein Playwright/Chromium-Export** benötigt.
- Slide-Größe wurde auf die Canva-Vorlage **1122 × 1402 px** umgestellt.
- Match-Karten, Meta-Bar, Team-Tag und VS-Element nutzen jetzt die exportierten Canva-Assets.
- Ergebnis-Slides zeigen die Resultate in `#bf0b0f`.
- Meta-Zeile zeigt bei Heimspielen weiter die Halle und bei Auswärtsspielen `AUSWÄRTS`.
- Textblöcke auf Team- und Gegnerseite werden automatisch verkleinert, wenn Namen sonst überlaufen würden.
