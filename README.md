# SGHNMS Social Generator

Webbasierter Generator für Spieltags- und Ergebnisgrafiken der **SG Handball Neumünster**.

Die Anwendung liest den aktuellen Spielplan des Vereins automatisiert von **handball.net**, bereitet die Daten für die SG auf und erzeugt daraus Instagram-Grafiken im Vereinsdesign. Die fertigen Slides können direkt im Browser geprüft, bei Bedarf korrigiert und anschließend als PNG heruntergeladen werden.

## Live-Version

https://hannesmodes-sghnms.github.io/sghnms_Grafikgenerator/

## Was der Generator kann

Über die Oberfläche werden ein Start- und Enddatum sowie die gewünschte Variante ausgewählt:

- **Spieltag** – erzeugt getrennte Slides für Heim- und Auswärtsspiele.
- **Ergebnisse** – erzeugt Ergebnis-Slides für bereits abgeschlossene Spiele.

Die Spiele werden automatisch nach Datum, Heim-/Auswärtsspiel und bei Heimspielen nach Spielort gruppiert. Je nach Anzahl der Spiele passt sich die Darstellung der Match-Cards automatisch an.

Für jede Match-Card werden unter anderem dargestellt:

- SG-Teambezeichnung
- Uhrzeit bzw. Ergebnis
- Gegner
- Datum und Wochentag
- bei Heimspielen der Spielort

Die Gestaltung basiert auf festen SGHNMS-Assets und der Schrift **Bebas Neue Bold**. Überschriften wie `HEIMSPIELE`, `AUSWÄRTSSPIELE` und `ERGEBNISSE` werden als vorbereitete SVG-Grafiken verwendet.

## Manuelle Overrides

handball.net liefert nicht immer die Darstellung, die für Social Media sinnvoll ist. Deshalb können die sichtbaren Werte vor dem Export pro Spiel überschrieben werden.

Über **„Overrides bearbeiten“** lassen sich ändern:

- Teamname links
- Uhrzeit bei Spieltagsgrafiken
- Ergebnis bei Ergebnisgrafiken
- Teamname rechts

Die Originaldaten werden dadurch nicht verändert. Die Overrides gelten nur für die aktuelle Darstellung und den anschließenden PNG-Export.

Das ist beispielsweise hilfreich bei sehr langen Mannschaftsnamen oder wenn ein Ergebnis bei handball.net noch nicht korrekt hinterlegt wurde.

## PNG-Export

Jeder generierte Slide kann direkt im Browser als PNG exportiert werden.

Die Grafik wird clientseitig mit `html2canvas` gerendert. Die Ausgabe erfolgt im festen Instagram-Format von **1122 × 1402 Pixeln**.

Es ist kein zusätzlicher Rendering-Server notwendig.

## Datenquelle

Die Spieldaten stammen aus der handball.net Club-API der SG Handball Neumünster:

```text
club_id=1yrb3n9
```

Da die neue handball.net API einen `X-Client-Token` erwartet, liest das Update-Script den jeweils aktuellen Token aus der öffentlichen Club-Seite aus und verwendet ihn anschließend für die API-Abfrage.

Das Script bestimmt automatisch die aktuelle Handball-Saison und lädt den kompletten Spielplan für den Zeitraum September bis Juni.

Die normalisierten Daten werden gespeichert unter:

```text
public/data/matches.json
```

Die eigentliche Website greift anschließend nur noch auf diese statische JSON-Datei zu.

## Automatische Aktualisierung und Deployment

Die Anwendung läuft vollständig über **GitHub Pages**. Ein dauerhaft laufender Server ist nicht notwendig.

Der Workflow

```text
.github/workflows/deploy-pages.yml
```

führt folgende Schritte aus:

1. Repository auschecken
2. Node.js installieren
3. Abhängigkeiten installieren
4. aktuellen Saisonspielplan von handball.net abrufen
5. `public/data/matches.json` erzeugen
6. `html2canvas` für den statischen Betrieb bereitstellen
7. den Inhalt von `public/` als GitHub Pages Website deployen

Der Workflow startet automatisch:

- bei jedem Push auf `main`
- alle 30 Minuten
- manuell über `workflow_dispatch`

Damit werden neue Spiele, Ergebnisse oder Änderungen bei handball.net regelmäßig ohne manuellen Eingriff übernommen.

## Team-Mapping

Die handball.net Team-IDs werden in

```text
public/config.js
```

auf die gewünschten Kurzbezeichnungen der SG gemappt.

Beispiel:

```js
export const TEAM_LABELS = Object.freeze({
  "86801": "FRAUEN 1",
  "86805": "HERREN 1",
  "87109": "WJE 1",
  "87110": "WJE 2"
});
```

Neue SG-Teams müssen dort ergänzt werden, damit sie vom Generator als eigene Mannschaft erkannt und korrekt bezeichnet werden.

Auch Kurzbezeichnungen für Hallen können dort gepflegt werden:

```js
export const VENUE_LABELS = Object.freeze({
  "KSV-HALLE NMS": "KSV-HALLE",
  "PESTALOZZI-SCHULE": "PESTA"
});
```

## Projektstruktur

```text
.
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── public/
│   ├── assets/
│   │   ├── canva/
│   │   ├── fonts/
│   │   ├── headlines/
│   │   └── sghnms_images/
│   ├── data/
│   │   └── matches.json
│   ├── app.js
│   ├── config.js
│   ├── index.html
│   ├── slide.css
│   └── styles.css
├── scripts/
│   ├── prepare-static.js
│   └── update-matches.js
├── package.json
└── server.js
```

## Lokal entwickeln

Voraussetzung ist **Node.js 20 oder neuer**.

Abhängigkeiten installieren:

```bash
npm install
```

Aktuelle handball.net Daten laden:

```bash
npm run update:data
```

Lokalen Server starten:

```bash
npm start
```

Danach ist der Generator unter folgendem Pfad erreichbar:

```text
http://localhost:3000
```

## Relevante npm-Scripts

```bash
npm start
```

Bereitet die statischen Assets vor und startet den lokalen Webserver.

```bash
npm run update:data
```

Lädt den aktuellen Saisonspielplan von handball.net und aktualisiert `public/data/matches.json`.

```bash
npm run prepare:static
```

Kopiert `html2canvas` aus `node_modules` nach `public/vendor/`, damit die Bibliothek auf GitHub Pages statisch verfügbar ist.

```bash
npm run build
```

Aktualisiert die Spieldaten und bereitet anschließend alle statischen Assets vor.

## Design-Assets

Die Social-Media-Grafiken verwenden feste Design-Dateien aus dem Repository, insbesondere:

```text
public/assets/sghnms_images/sghnms_bg.png
public/assets/fonts/BebasNeue-Bold.ttf
public/assets/headlines/*.svg
public/assets/canva/*
```

Die Match-Cards selbst werden aus diesen Assets und dynamisch erzeugtem HTML/CSS zusammengesetzt. Dadurch bleiben Spielzeiten, Ergebnisse und Teamnamen dynamisch, während das visuelle Grunddesign unverändert bleibt.

## Technischer Aufbau

Der Produktivbetrieb besteht im Wesentlichen aus zwei voneinander getrennten Teilen:

**GitHub Action / Build-Zeit**

```text
handball.net
    ↓
scripts/update-matches.js
    ↓
public/data/matches.json
    ↓
GitHub Pages Deployment
```

**Browser / Laufzeit**

```text
matches.json
    ↓
Datumsfilter + Gruppierung
    ↓
HTML/CSS Slide
    ↓
optionale Overrides
    ↓
html2canvas
    ↓
PNG-Download
```

Dadurch benötigt die öffentlich erreichbare Anwendung keine eigene API, Datenbank oder dauerhaft laufende Serverinstanz.

## Einzelspiel-Prototyp

Für die Entwicklung des Einzelspiel-Slides sollte ein separater Branch verwendet werden, z. B.:

```text
feature/einzelspiel-slide
```

Die Variante **Einzelspiel** ergänzt die bestehende Oberfläche um eine Spielauswahl innerhalb des gewählten Datumsbereichs. Der Prototyp nutzt weiterhin die statischen Saisondaten aus `public/data/matches.json` und erzeugt genau einen Slide für das ausgewählte Spiel.

### Vereinslogos

Vereinslogos werden bewusst **nicht** im regulären 6-Stunden-Workflow abgefragt. Das verhindert unnötige Requests an handball.net / handball360.

Der Logo-Audit wird manuell ausgeführt:

```bash
npm run update:data
npm run logos:audit
```

Das Script:

1. sammelt alle Teams aus dem aktuellen Saisonspielplan,
2. öffnet die jeweilige öffentliche handball.net Teamseite,
3. ermittelt das dort verwendete handball360-Logo,
4. speichert die Originaldatei unter `public/assets/club-logos/raw/`,
5. erzeugt eine lokale PNG-Version unter `public/assets/club-logos/processed/`,
6. entfernt nur helle Außenflächen, die vom Bildrand aus zusammenhängend erreichbar sind,
7. schreibt Auflösung, Format, Transparenz und Qualitätsstatus nach `public/data/club-logos.json`.

Wichtig: Es wird **nicht pauschal alles Weiße transparent** gesetzt. Weiße Flächen im Inneren eines Logos bleiben deshalb normalerweise erhalten.

Problematische Logos können manuell ersetzt werden:

```text
public/assets/club-logos/overrides/<clubId>.png
```

Eine Override-Datei hat beim nächsten Audit Vorrang vor der automatisch aufbereiteten Version.

Der Logo-Audit ist absichtlich **nicht** Teil von `.github/workflows/deploy-pages.yml`.
