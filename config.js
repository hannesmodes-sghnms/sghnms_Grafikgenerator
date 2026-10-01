export const CLUB_ID = "1yrb3n9";
export const HANDBALL_BASE = "https://www.handball.net";
export const CACHE_TTL = 5 * 60 * 1000;

export const BRAND = Object.freeze({
  clubName: "SG Handball Neumünster",
  homeTitle: "HEIMSPIELE",
  awayTitle: "AUSWÄRTSSPIELE",
  resultsTitle: "ERGEBNISSE"
});

/*
 * SGHNMS Team-ID -> Anzeigename
 * Saison 2026/27, aus dem handball.net Club-Spielplan ermittelt.
 */
export const TEAM_LABELS = Object.freeze({
  "86801": "FRAUEN 1",
  "94480": "FRAUEN 2",
  "94481": "FRAUEN 3",
  "94482": "FRAUEN 4",

  "86805": "HERREN 1",
  "94483": "HERREN 2",
  "94484": "HERREN 3",

  "87271": "WJA 1",
  "87272": "WJA 2",

  "87175": "WJB 1",
  "87275": "WJB 2",
  "87274": "MJB",

  "87265": "WJC 1",
  "87277": "WJC 2",
  "87187": "MJC 1",
  "87276": "MJC 2",

  "87105": "WJD",
  "87103": "MJD 1",
  "87104": "MJD 2",

  "87109": "WJE 1",
  "87110": "WJE 2",
  "87107": "MJE 1",
  "87108": "MJE 2"
});

/*
 * Hallenname aus handball.net -> Kurzname für die Grafik.
 * Weitere Hallen können jederzeit ergänzt werden.
 */
export const VENUE_LABELS = Object.freeze({
  "KSV-HALLE NMS": "KSV-HALLE",
  "KSV-HALLE": "KSV-HALLE",
  "PESTALOZZI-SCHULE": "PESTA",
  "PESTALOZZI SCHULE": "PESTA"
});
