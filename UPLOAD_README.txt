SGHNMS QA/Cleanup v9
====================

Basis: feature/einzelspiel-slide

Dateien aus diesem ZIP im Repository mit gleicher Ordnerstruktur ueberschreiben/anlegen.

Danach im Codespace:

  git pull origin feature/einzelspiel-slide
  npm install
  npm run update:data
  npm run qa
  npm start

Wenn der UI-Test passt, einmalig die Override-Logos fuer die Web-Ausgabe optimieren:

  npm run logos:optimize
  npm run qa

logos:optimize ersetzt die PNGs in public/assets/club-logos/overrides/ in-place.
Die bearbeiteten hochaufloesenden Master daher bei Bedarf lokal sichern.

Anschliessend die durch logos:optimize geaenderten PNGs sowie public/data/club-logos.json committen.

Wichtigste funktionale Aenderungen:
- Einzelergebnis-Override nutzt jetzt immer Heim:Auswaerts.
- Live-Spiele gelten nicht als fertige Ergebnisse.
- Single-Namen und Meta-Texte erhalten Auto-Fitting.
- Uebersicht und Single nutzen denselben Background/Canvas aus slide-base.css.
- Pages-Deployment baut ein schlankeres dist/ ohne ungenutzte Raw-Logos/Fonts.
- Neues npm run qa und npm run logos:optimize.
