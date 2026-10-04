# Logo Overrides

Dieser Ordner ist die primäre Logoquelle für Einzelspiel- und Einzelergebnis-Slides.

Dateiname:

```text
<clubId>.png
```

Falls keine Club-ID vorhanden ist, wird ersatzweise `team-<teamId>.png` verwendet.

Priorität:

1. `overrides/<clubId>.png`
2. unverändertes Original aus `../raw/`
3. Platzhalter

Hilfsscripts:

```bash
npm run logos:sync
npm run logos:seed-overrides
npm run logos:optimize
```

`logos:seed-overrides` überschreibt keine bestehenden Dateien.
`logos:optimize` skaliert und komprimiert bestehende Overrides in-place auf die Web-Rendergröße.

`LOGO_INDEX.csv` enthält die Zuordnung zu Vereins-/Teamnamen und Quellen.
