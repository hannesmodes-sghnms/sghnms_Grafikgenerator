SGHNMS Einzelspiel-Ergebnis-Slide
=================================

Basis: Branch feature/einzelspiel-slide

Enthaltene Aenderungen:
- neue Variante "Einzelergebnis"
- in dieser Variante werden nur abgeschlossene Spiele angeboten
- Headline "ERGEBNIS"
- Uhrzeit faellt aus der Match-Card heraus
- VS-Element wird durch das Ergebnis ersetzt
- Ergebnis-Design wie bei den gesammelten Ergebnis-Slides:
  Bebas Neue, #bf0b0f, 137px, Doppelpunkt
- Heimteam bleibt links, Auswaertsteam rechts
- Ergebnis wird immer in Heim:Auswaerts-Reihenfolge dargestellt
- Ergebnis-Override bleibt moeglich

Anwendung im Codespace:

  git checkout feature/einzelspiel-slide
  git pull origin feature/einzelspiel-slide
  git apply single-result.patch
  npm start

Danach pruefen und committen:

  git status
  git add public/index.html public/app.js public/single-match.js public/single-slide.css
  git commit -m "Add single match result slide"
  git push origin feature/einzelspiel-slide
