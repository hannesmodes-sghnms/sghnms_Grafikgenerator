# Logo Overrides

Dieser Ordner ist die primaere Quelle fuer Vereinslogos im Einzelspiel-Generator.

## Dateinamen

Die Dateien werden nach der handball.net Club-ID benannt:

```text
5575.png
```

Wenn keine Club-ID vorhanden ist, wird ersatzweise die Team-ID verwendet:

```text
team-87123.png
```

## Verhalten

1. Existiert ein PNG in diesem Ordner, wird es verwendet.
2. Existiert kein Override, verwendet der Generator das unveraenderte handball.net Logo aus `../raw/`.
3. Fehlt auch das Raw-Logo, zeigt der Generator den bisherigen Platzhalter.

`npm run logos:seed-overrides` legt fuer alle aktuell bekannten Vereine einmalig eine PNG-Kopie des handball.net Originals in diesem Ordner an. Bereits bearbeitete Dateien werden niemals ueberschrieben.

`LOGO_INDEX.csv` ordnet die Dateien den Vereins-/Teamnamen und den jeweiligen handball.net Quellen zu.
