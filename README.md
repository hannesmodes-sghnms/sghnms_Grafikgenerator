# SGHNMS Social Generator

Statischer Instagram-Spieltag-/Ergebnisgenerator für SG Handball Neumünster.

## Architektur ab v21

Der Generator läuft produktiv vollständig über GitHub Pages:

1. GitHub Actions ruft regelmäßig die handball.net Club-API ab.
2. Der aktuelle Saisonspielplan wird beim Build nach `public/data/matches.json` geschrieben.
3. GitHub Pages liefert nur statische Dateien aus.
4. Filterung, Slide-Gruppierung, Rendering und PNG-Download laufen komplett im Browser.

Ein dauerhaft laufender Node-/Cloud-Server ist damit nicht mehr erforderlich.

## GitHub Pages aktivieren

Im Repository einmalig:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Danach deployt `.github/workflows/deploy-pages.yml` automatisch:

- bei jedem Push auf `main`
- alle 30 Minuten
- manuell über **Actions → Deploy GitHub Pages → Run workflow**

## Lokaler Test

```bash
npm install
npm run update:data
npm start
```

Danach im Browser:

```text
http://localhost:3000
```

## Datenquelle

`npm run update:data`:

- bestimmt automatisch die aktuelle Handball-Saison
- lädt den Vereins-Spielplan über `club_id=1yrb3n9`
- liest den aktuellen `client-token` aus der öffentlichen handball.net Club-Seite
- speichert die normalisierten Spiele unter `public/data/matches.json`

## Bestehende Assets

Die bereits im Repository vorhandenen Design-Assets und Fonts bleiben unverändert erforderlich, insbesondere:

```text
public/assets/sghnms_images/sghnms_bg.png
public/assets/fonts/BebasNeue-Bold.ttf
public/assets/headlines/*.svg
public/assets/canva/*
```
