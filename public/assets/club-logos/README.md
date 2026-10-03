# Club logos

- `raw/`: Originaldateien von handball360 / handball.net
- `processed/`: automatisch erzeugte PNGs, bei denen nur vom Bildrand zusammenhängende helle Flächen transparent gesetzt werden
- `overrides/`: manuell geprüfte PNGs; Datei `<clubId>.png` hat Vorrang vor der automatischen Variante

Erzeugen / aktualisieren:

```bash
npm run update:data
npm run logos:audit
```

Erneut laden, auch wenn bereits Dateien vorhanden sind:

```bash
npm run logos:audit -- --force
```
