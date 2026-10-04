import {
  escapeHtml,
  ownTeamPerspective,
  renderBreakableName,
  slugify,
  venueLabel
} from "./match-utils.js";

function shortCompetition(value = "") {
  const name = String(value).trim();
  const upper = name.toUpperCase();

  if (upper.startsWith("OBERLIGA SCHLESWIG-HOLSTEIN")) return "OBERLIGA SH";
  if (upper.startsWith("REGIONALLIGA NORD")) return "REGIONALLIGA NORD";
  if (upper.startsWith("LANDESLIGA")) return "LANDESLIGA";
  if (upper.startsWith("KREISOBERLIGA")) return "KREISOBERLIGA";
  if (upper.startsWith("KREISLIGA")) return "KREISLIGA";
  if (upper.startsWith("KREISKLASSE")) return "KREISKLASSE";

  return name || "WETTBEWERB";
}

function compactTeamLabel(value = "") {
  const text = String(value).trim();
  return text.replace(/\s+1$/, "");
}

function headlineAssetFor(headline = "") {
  const assets = {
    HEIMSPIEL: "assets/headlines/heimspiel.png",
    "AUSWÄRTS": "assets/headlines/auswaerts.png",
    ERGEBNIS: "assets/headlines/ergebnis.png"
  };

  return assets[String(headline).trim().toUpperCase()] || null;
}

function manifestAssetForTeam(team, logoManifest) {
  if (!team) return null;

  const teamId = String(team.id ?? "");
  const fallbackKey = team.clubId != null
    ? String(team.clubId)
    : `team-${teamId}`;
  const key = logoManifest?.teams?.[teamId] ?? fallbackKey;
  const club = logoManifest?.clubs?.[key];

  return club?.asset || null;
}

function renderLogo(team, logoManifest) {
  const asset = manifestAssetForTeam(team, logoManifest);

  if (asset) {
    return `<img class="single-logo" src="${escapeHtml(asset)}" alt="${escapeHtml(team?.name || "Vereinslogo")}">`;
  }

  const initials = String(team?.name || "LOGO")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return `<div class="single-logo-placeholder">${escapeHtml(initials || "LOGO")}</div>`;
}

function fitScript() {
  return `
    (() => {
      const slide = document.getElementById("single-slide-root");
      const BASE_WIDTH = 1122;
      const BASE_HEIGHT = 1402;

      function fit() {
        const scale = Math.min(1, window.innerWidth / BASE_WIDTH);
        slide.style.transform = "scale(" + scale + ")";
        document.body.style.width = (BASE_WIDTH * scale) + "px";
        document.body.style.height = (BASE_HEIGHT * scale) + "px";
      }

      function renderedLineCount(element) {
        const range = document.createRange();
        range.selectNodeContents(element);
        const rects = [...range.getClientRects()]
          .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
          .sort((a, b) => a.top - b.top || a.left - b.left);
        const tops = [];

        for (const rect of rects) {
          if (!tops.some((top) => Math.abs(top - rect.top) < 2)) {
            tops.push(rect.top);
          }
        }

        return Math.max(1, tops.length);
      }

      function shrinkText(element, { minSize, maxLines = 1, step = 0.5 } = {}) {
        element.style.removeProperty("font-size");
        element.style.removeProperty("line-height");

        const computed = window.getComputedStyle(element);
        let fontSize = parseFloat(computed.fontSize) || 40;
        let lineHeight = parseFloat(computed.lineHeight) || fontSize * 0.92;
        const targetMin = minSize || Math.max(18, fontSize * 0.65);
        let guard = 0;

        const apply = () => {
          element.style.fontSize = fontSize + "px";
          element.style.lineHeight = lineHeight + "px";
        };

        apply();

        while (
          guard < 160 &&
          fontSize > targetMin &&
          (
            element.scrollWidth > element.clientWidth + 1 ||
            renderedLineCount(element) > maxLines
          )
        ) {
          fontSize = Math.max(targetMin, fontSize - step);
          lineHeight = fontSize * 0.92;
          apply();
          guard += 1;
        }
      }

      function fitTextBlocks() {
        document.querySelectorAll(".fit-single-meta").forEach((element) => {
          shrinkText(element, { minSize: 28, maxLines: 1, step: 0.5 });
        });

        document.querySelectorAll(".fit-single-name").forEach((element) => {
          shrinkText(element, { minSize: 26, maxLines: 2, step: 0.5 });
        });
      }

      function waitForImages() {
        return Promise.all([...document.images].map((image) => {
          if (image.complete) return Promise.resolve();
          return new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        }));
      }

      async function prepareLayout() {
        await document.fonts.ready;
        await waitForImages();
        fitTextBlocks();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }

      async function renderSlideBlob() {
        if (!window.html2canvas) {
          throw new Error("PNG-Renderer konnte nicht geladen werden.");
        }

        await prepareLayout();

        const oldTransform = slide.style.transform;
        const oldBodyWidth = document.body.style.width;
        const oldBodyHeight = document.body.style.height;

        slide.style.transform = "none";
        document.body.style.width = BASE_WIDTH + "px";
        document.body.style.height = BASE_HEIGHT + "px";

        try {
          const canvas = await window.html2canvas(slide, {
            width: BASE_WIDTH,
            height: BASE_HEIGHT,
            scale: 1,
            useCORS: true,
            allowTaint: false,
            backgroundColor: null,
            logging: false,
            windowWidth: BASE_WIDTH,
            windowHeight: BASE_HEIGHT
          });

          return await new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error("PNG konnte nicht erzeugt werden."));
            }, "image/png");
          });
        } finally {
          slide.style.transform = oldTransform;
          document.body.style.width = oldBodyWidth;
          document.body.style.height = oldBodyHeight;
          fit();
        }
      }

      window.sghnmsRenderSlidePng = renderSlideBlob;

      async function init() {
        await prepareLayout();
        fit();
      }

      init();
      window.addEventListener("resize", async () => {
        await prepareLayout();
        fit();
      });
    })();
  `;
}

export function singleMatchOptionLabel(match) {
  const perspective = ownTeamPerspective(match);
  if (!perspective) return null;

  const label = perspective.teamLabel;
  const opponent = perspective.opponent?.name || "Gegner";
  const place = perspective.isHome ? "HEIM" : "AUSWÄRTS";

  return `${match.dateText} · ${match.time} · ${label} · ${opponent} · ${place}`;
}

export function buildSingleSlide(match, { overrides = {}, logoManifest = {}, resultMode = false } = {}) {
  const perspective = ownTeamPerspective(match);
  if (!perspective) return null;

  const teamLabel = overrides.teamLabel ?? perspective.teamLabel;
  const opponentName = overrides.opponent ?? perspective.opponent?.name ?? "";
  const time = overrides.time ?? match.time;
  const venue = venueLabel(match.venue?.name).toUpperCase();
  const competition = shortCompetition(match.competition).toUpperCase();
  const phase = String(match.phase?.name || "").trim().toUpperCase();
  const metaParts = [competition, compactTeamLabel(teamLabel), phase].filter(Boolean);
  const sgDisplayName = "SG HANDBALL NEUMÜNSTER";
  const homeDisplayName = perspective.isHome ? sgDisplayName : opponentName;
  const awayDisplayName = perspective.isHome ? opponentName : sgDisplayName;
  const rawOwnScore = perspective.isHome ? match.result?.home : match.result?.away;
  const rawOpponentScore = perspective.isHome ? match.result?.away : match.result?.home;
  const ownScore = overrides.ownScore ?? rawOwnScore ?? null;
  const opponentScore = overrides.opponentScore ?? rawOpponentScore ?? null;
  const homeScore = perspective.isHome ? ownScore : opponentScore;
  const awayScore = perspective.isHome ? opponentScore : ownScore;

  return {
    id: match.id,
    headline: resultMode ? "ERGEBNIS" : (perspective.isHome ? "HEIMSPIEL" : "AUSWÄRTS"),
    isResult: resultMode,
    isHome: perspective.isHome,
    meta: metaParts.join("  |  "),
    venue,
    time,
    teamLabel,
    opponentName,
    homeDisplayName,
    awayDisplayName,
    homeScore,
    awayScore,
    homeTeam: match.home,
    awayTeam: match.away,
    logoManifest,
    filename: `${resultMode ? "ergebnis" : (perspective.isHome ? "heimspiel" : "auswaerts")}-${slugify(teamLabel)}-${slugify(opponentName)}-${match.date}`
  };
}

export function renderSingleSlideDocument(slide, baseHref) {
  const homeLogo = renderLogo(slide.homeTeam, slide.logoManifest);
  const awayLogo = renderLogo(slide.awayTeam, slide.logoManifest);
  const headlineAsset = headlineAssetFor(slide.headline);
  const headlineMarkup = headlineAsset
    ? `<img class="single-headline__asset" src="${escapeHtml(headlineAsset)}" alt="${escapeHtml(slide.headline)}">`
    : escapeHtml(slide.headline);

  const homeName = renderBreakableName(slide.homeDisplayName);
  const awayName = renderBreakableName(slide.awayDisplayName);

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${escapeHtml(baseHref)}">
  <title>${escapeHtml(slide.headline)}</title>
  <link rel="stylesheet" href="single-slide.css">
</head>
<body>
  <div id="single-slide-root" class="single-slide">
    <div class="single-headline">${headlineMarkup}</div>

    <div class="single-meta">
      <div class="single-meta__line fit-single-meta">${escapeHtml(slide.meta)}</div>
      <div class="single-meta__venue fit-single-meta">${escapeHtml(slide.venue)}</div>
    </div>

    <div class="single-logos">
      <div class="single-logo-slot">${homeLogo}</div>
      <div class="single-logo-slot">${awayLogo}</div>
    </div>

    <div class="single-card ${slide.isResult ? "single-card--result" : ""}">
      ${slide.isResult ? `
        <div class="single-card__home"><div class="single-card__name-text fit-single-name">${homeName}</div></div>

        <div class="single-card__score" aria-label="${escapeHtml(`${slide.homeScore ?? "-"} zu ${slide.awayScore ?? "-"}`)}">
          <span class="single-card__score-number">${escapeHtml(slide.homeScore ?? "-")}</span>
          <span class="single-card__score-separator">:</span>
          <span class="single-card__score-number">${escapeHtml(slide.awayScore ?? "-")}</span>
        </div>

        <div class="single-card__away"><div class="single-card__name-text fit-single-name">${awayName}</div></div>
      ` : `
        <div class="single-card__time">
          <div class="single-card__time-main">${escapeHtml(slide.time)}</div>
          <div class="single-card__time-label">UHR</div>
        </div>

        <div class="single-card__home"><div class="single-card__name-text fit-single-name">${homeName}</div></div>

        <div class="single-card__vs" aria-hidden="true">
          <img src="assets/canva/vs-divider.png" alt="">
        </div>

        <div class="single-card__away"><div class="single-card__name-text fit-single-name">${awayName}</div></div>
      `}
    </div>
  </div>

  <script src="vendor/html2canvas/html2canvas.min.js"></script>
  <script>${fitScript()}</script>
</body>
</html>`;
}

export function hasLocalLogos(slide) {
  const home = manifestAssetForTeam(slide.homeTeam, slide.logoManifest);
  const away = manifestAssetForTeam(slide.awayTeam, slide.logoManifest);
  return Boolean(home && away);
}
