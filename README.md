# SGHNMS Handball Social Generator v12

## Änderungen gegenüber v11

### Headline Drop

Der Edo-Headline wird der Canva-**Drop** jetzt über `filter: drop-shadow(...)` statt `text-shadow` gegeben. Dadurch folgt der Effekt der tatsächlichen Edo-Glyphenkontur inklusive Brush-Kanten und Umlaut-Punkten.

Grundlage der Canva-Einstellungen:

- Richtung: `-45`
- Versatz: `50`
- Blur: `0`
- Transparenz: `40`
- Farbe: Schwarz

Die CSS-Näherung ist zentral über diese Variablen steuerbar:

```css
--headline-drop-x: 11px;
--headline-drop-y: 11px;
--headline-drop-color: rgba(0, 0, 0, 0.60);
```

### Nur echtes Bebas Neue Bold

Für den Slide wird **kein Bebas Neue Regular mehr registriert**. Es gibt nur noch:

```text
public/assets/fonts/BebasNeue-Bold.ttf
```

und Edo für die Brush-Headline:

```text
public/assets/fonts/edo.ttf
```

Alle Texte außer der Edo-Headline werden mit `Bebas Neue`, `font-weight: 700` und `font-synthesis: none` gerendert.

### Abgerundete Match Card

Die komplette Match-Card wird jetzt mit `border-radius: 22px` und `overflow: hidden` geclippt. Zusätzlich erhält das Hintergrundbild selbst dieselbe Rundung. Damit bleiben auch die separat positionierten Trapez-/VS-/Text-Layer innerhalb der runden weißen Karte.

## Weiter benötigte lokale Assets

```text
public/assets/fonts/edo.ttf
public/assets/fonts/BebasNeue-Bold.ttf
public/assets/sghnms_images/sghnms_bg.png
```

Die Fontdateien selbst sind nicht Bestandteil dieses ZIPs; vorhandene Dateien im Repo bitte beibehalten.

## Start

```bash
npm install
npm start
```
