# SGHNMS Social Generator

Generator für Spieltags- und Ergebnisgrafiken aus der handball.net API.

## Start

```bash
npm install
npm start
```

Danach Port 3000 öffnen.

## Assets

Diese Dateien werden erwartet und bleiben bewusst außerhalb des ZIPs, wenn sie nicht in ChatGPT hochgeladen wurden:

```text
public/assets/sghnms_images/sghnms_bg.png
public/assets/fonts/edo.ttf
```

Bebas Neue wird lokal über `@fontsource/bebas-neue` ausgeliefert.

## PNG-Export

Der PNG-Export läuft ab Version 0.3.0 direkt im Browser über `html2canvas`.
Dadurch ist kein Playwright/Chromium mehr nötig und es müssen keine zusätzlichen
Linux-Bibliotheken im Codespace installiert werden.

Die Ausgabegröße bleibt 1080 x 1350 Pixel.
