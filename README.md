# SGHNMS Social Generator

Webbasierter Generator für Social-Media-Grafiken der **SG Handball Neumünster**. Die Anwendung liest den aktuellen Saisonspielplan von handball.net, bereitet die Daten statisch auf und rendert daraus Grafiken im SGHNMS-Design.

Live-Version:

```text
https://hannesmodes-sghnms.github.io/sghnms_Grafikgenerator/
```

## Varianten

Der Generator unterstützt vier Modi:

- **Spieltag** – gruppierte Heim- und Auswärtsspiel-Slides
- **Ergebnisse** – gruppierte Ergebnis-Slides für abgeschlossene Spiele
- **Einzelspiel** – genau ein ausgewähltes Spiel mit Heimteam links und Auswärtsteam rechts
- **Einzelergebnis** – Einzelspiel-Ergebnis mit Heimteam links, Auswärtsteam rechts und Ergebnis in der Mitte

Die Ausgabe erfolgt im festen Format **1122 × 1402 px**. Der PNG-Export läuft vollständig clientseitig über `html2canvas`.

## Datenquelle

Club-ID der SG Handball Neumünster:

```text
1yrb3n9
```

`scripts/update-matches.js` liest den aktuellen `client-token` aus der öffentlichen handball.net Club-Seite und ruft anschließend die Match-API ab. Datum und Uhrzeit werden bewusst als lokale handball.net Wall-Clock-Zeit verarbeitet, damit keine Sommerzeitverschiebung entsteht.

Die normalisierten Daten werden nach

```text
public/data/matches.json
```

geschrieben.

## Deployment

Die Produktion läuft statisch über GitHub Pages. Der Workflow

```text
.github/workflows/deploy-pages.yml
```

läuft:

- bei jedem Push auf `main`
- alle **6 Stunden**
- manuell über `workflow_dispatch`

Ablauf:

```text
handball.net
  -> npm run update:data
  -> npm run qa:deploy
  -> npm run prepare:static
  -> npm run prepare:pages
  -> GitHub Pages
```

Logo-Abfragen sind bewusst **nicht** Teil dieses 6-Stunden-Workflows. Das Pages-Artefakt wird nach `dist/` gebaut und enthält nur Laufzeit-Assets; ungenutzte Raw-Logos und Fontvarianten bleiben dadurch aus dem Deployment heraus.

## Team- und Hallen-Mapping

SG-Team-IDs und Hallenkürzel werden in

```text
public/config.js
```

gepflegt. Neue SG-Team-IDs müssen dort ergänzt werden. `npm run qa` meldet fehlende Zuordnungen.

## Vereinslogos

Die Logo-Strategie ist bewusst einfach:

```text
Override vorhanden
  -> public/assets/club-logos/overrides/<clubId>.png
sonst Raw vorhanden
  -> public/assets/club-logos/raw/<clubId>.<ext>
sonst
  -> Platzhalter
```

### Logos synchronisieren

```bash
npm run update:data
npm run logos:sync
```

`logos:sync` sucht nur fehlende bzw. mit `--force` angeforderte Originale und aktualisiert `public/data/club-logos.json`.

### PNG-Overrides einmalig anlegen

```bash
npm run logos:seed-overrides
```

Das Script konvertiert vorhandene Raw-Logos nur nach PNG. Es findet **keine** automatische Freistellung statt. Bereits vorhandene Overrides werden nicht überschrieben.

Die Zuordnung steht in:

```text
public/assets/club-logos/overrides/LOGO_INDEX.csv
```

### Overrides für die Web-Ausgabe optimieren

```bash
npm run logos:optimize
```

Die Override-PNGs werden proportional in eine maximale Renderbox von **860 × 600 px** gebracht. Kleine Logos werden mit Lanczos hochskaliert, große Logos verkleinert und komprimiert. Das Seitenverhältnis bleibt erhalten.

Wichtig: Das Script ersetzt die Override-PNGs in-place. Wer hochauflösende Master behalten möchte, sollte diese lokal separat sichern.

## Manuelle Overrides im Generator

Für gruppierte Slides können pro Match weiterhin SG-Teamlabel, Uhrzeit/Ergebnis und Gegnername angepasst werden.

Bei Einzelspiel-Slides gelten klarere Felder:

- **SG-Team im Meta** – z. B. `WJE 2`
- **Uhrzeit** oder bei Ergebnissen **Heim:Auswärts**
- **Gegnername**

Beim Einzelergebnis wird der Score immer in visueller Reihenfolge **Heim:Auswärts** eingegeben, unabhängig davon, ob die SG Heim- oder Auswärtsteam ist.

## Gemeinsame Slide-Basis

Gemeinsame Canvas-, Font-, Farb- und Background-Regeln liegen in:

```text
public/slide-base.css
```

Darauf bauen auf:

```text
public/slide.css          # Übersichtsslides
public/single-slide.css   # Einzelspiel/Einzelergebnis
```

Damit verwenden beide Layoutfamilien denselben Hintergrund und dieselben Grundparameter.

## QA

Vor einem Merge oder nach Änderungen an Daten/Assets:

```bash
npm run update:data
npm run qa
```

Geprüft werden unter anderem:

- Pflichtdateien und JavaScript-Syntax
- gültige Spieldaten
- SG-Team-IDs gegen `TEAM_LABELS`
- Logo-Manifest und referenzierte Assets
- fehlende Logos als Warnung

Im Deployment läuft dieselbe Prüfung in strengerem Modus über:

```bash
npm run qa:deploy
```

## Lokale Entwicklung

Voraussetzung: **Node.js 20+**

```bash
npm install
npm run update:data
npm start
```

Lokale URL:

```text
http://localhost:3000
```

## Relevante npm-Scripts

```text
npm start                  Lokalen statischen Server starten
npm run update:data        Saisonspielplan aktualisieren
npm run logos:sync         Fehlende handball.net Logos synchronisieren
npm run logos:seed-overrides  Raw-Logos einmalig als PNG-Overrides anlegen
npm run logos:optimize     Override-PNGs für die Web-Ausgabe optimieren
npm run qa                 Lokale QA
npm run qa:deploy          Strenge QA für Deployment
npm run prepare:static     html2canvas nach public/vendor kopieren
npm run prepare:pages      schlankes Pages-Artefakt nach dist/ bauen
npm run build              Datenupdate + QA + statische Assets + dist
```

## Projektstruktur

```text
.
├── .github/workflows/deploy-pages.yml
├── public/
│   ├── app.js
│   ├── match-utils.js
│   ├── single-match.js
│   ├── slide-base.css
│   ├── slide.css
│   ├── single-slide.css
│   ├── styles.css
│   ├── config.js
│   ├── data/
│   │   ├── matches.json
│   │   └── club-logos.json
│   └── assets/
│       ├── canva/
│       ├── club-logos/
│       ├── fonts/
│       ├── headlines/
│       └── sghnms_images/
├── scripts/
│   ├── update-matches.js
│   ├── logo-sync.js
│   ├── seed-logo-overrides.js
│   ├── logo-optimize.js
│   ├── qa.js
│   ├── prepare-static.js
│   └── prepare-pages.js
├── package.json
└── server.js
```
