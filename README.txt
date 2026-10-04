SGHNMS Einzelspiel / Einzelergebnis - Headline Images
=====================================================

Diese beiden Dateien ersetzen die bestehenden Dateien nach Anwendung des
Einzelergebnis-Patches.

Verwendete Assets aus public/assets/headlines/:
- heimspiel.png
- auswaerts.png
- ergebnis.png

Aenderungen:
- Text-Headline HEIMSPIEL -> heimspiel.png
- Text-Headline AUSWAERTS -> auswaerts.png
- Text-Headline ERGEBNIS -> ergebnis.png
- keine CSS-Rotation / Textschatten mehr; die Canva-Gestaltung kommt aus dem PNG
- Einzelergebnis-Logik aus dem vorherigen Patch bleibt enthalten

Dateien ersetzen:
- public/single-match.js
- public/single-slide.css

Danach:
  npm start

Wenn die Darstellung passt:
  git add public/single-match.js public/single-slide.css public/app.js public/index.html public/assets/headlines
  git commit -m "Add single match result slides and headline assets"
  git push origin feature/einzelspiel-slide
