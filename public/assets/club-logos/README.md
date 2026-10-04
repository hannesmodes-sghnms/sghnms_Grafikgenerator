# Club Logos

## Struktur

- `raw/` – unveränderte Originaldateien von handball.net / handball360
- `overrides/` – manuell gepflegte PNGs; diese haben immer Vorrang

Es gibt keine automatische Freistellung mehr.

## Workflow

Fehlende Originale synchronisieren:

```bash
npm run update:data
npm run logos:sync
```

Alle bekannten Raw-Logos einmalig als PNG-Override anlegen:

```bash
npm run logos:seed-overrides
```

Bereits vorhandene Overrides werden dabei nicht überschrieben.

Für die Web-Ausgabe optimieren:

```bash
npm run logos:optimize
```

Die Override-Dateien werden dabei proportional auf maximal 860 × 600 px gebracht und in-place ersetzt.

Priorität im Generator:

```text
overrides/<clubId>.png
  -> raw/<clubId>.<ext>
  -> Platzhalter
```

`overrides/LOGO_INDEX.csv` ordnet Club-ID, Teamnamen, Raw-Datei und Quelle zu.
