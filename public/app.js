import { BRAND, TEAM_LABELS, VENUE_LABELS } from "./config.js";
import { buildSingleSlide, hasLocalLogos, renderSingleSlideDocument, singleMatchOptionLabel } from "./single-match.js";

const form = document.querySelector("#generator-form");
const fromInput = document.querySelector("#from");
const toInput = document.querySelector("#to");
const modeInput = document.querySelector("#mode");
const singleMatchField = document.querySelector("#single-match-field");
const singleMatchInput = document.querySelector("#single-match");
const submitButton = form.querySelector('button[type="submit"]');
const status = document.querySelector("#status");
const dataInfo = document.querySelector("#data-info");
const slides = document.querySelector("#slides");

const BASE_HREF = new URL("./", window.location.href).href;

let dataSet = null;
let logoManifest = { generatedAt: null, clubs: {}, teams: {} };
const matchOverrides = new Map();

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setDefaultRange() {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 2);
  fromInput.value = isoDate(today);
  toInput.value = isoDate(end);
}

function refreshSingleMatchOptions() {
  const isSingle = modeInput.value === "single";
  singleMatchField.hidden = !isSingle;
  form.classList.toggle("controls--single", isSingle);

  if (!isSingle || !dataSet?.matches) return;

  const from = fromInput.value;
  const to = toInput.value;
  const currentValue = singleMatchInput.value;

  const options = dataSet.matches
    .filter((match) => (!from || match.date >= from) && (!to || match.date <= to))
    .map((match) => ({ match, label: singleMatchOptionLabel(match) }))
    .filter((item) => item.label);

  singleMatchInput.innerHTML = options.length
    ? options.map(({ match, label }) =>
        `<option value="${escapeHtml(match.id)}">${escapeHtml(label)}</option>`
      ).join("")
    : '<option value="">Keine passenden Spiele im Zeitraum</option>';

  if (options.some(({ match }) => String(match.id) === currentValue)) {
    singleMatchInput.value = currentValue;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function setStatus(message, type = "") {
  status.textContent = message;
  status.className = `status ${type}`.trim();
}

function venueLabel(name) {
  const key = String(name || "").trim().toUpperCase();
  return VENUE_LABELS[key] || String(name || "").trim();
}

function ownTeam(match) {
  const homeId = String(match.home?.id ?? "");
  const awayId = String(match.away?.id ?? "");

  if (TEAM_LABELS[homeId]) {
    return {
      isHome: true,
      teamId: homeId,
      teamLabel: TEAM_LABELS[homeId],
      opponent: match.away,
      ownScore: match.result?.home ?? null,
      opponentScore: match.result?.away ?? null
    };
  }

  if (TEAM_LABELS[awayId]) {
    return {
      isHome: false,
      teamId: awayId,
      teamLabel: TEAM_LABELS[awayId],
      opponent: match.home,
      ownScore: match.result?.away ?? null,
      opponentScore: match.result?.home ?? null
    };
  }

  return null;
}

function isFinished(match) {
  return Boolean(match.status?.finished) ||
    (match.result?.home !== null && match.result?.away !== null);
}

function buildSlides(matches, mode) {
  const relevant = matches
    .map((match) => ({ match, perspective: ownTeam(match) }))
    .filter((item) => item.perspective)
    .filter((item) => mode !== "results" || isFinished(item.match));

  const groups = new Map();

  for (const { match, perspective } of relevant) {
    let key;
    let title;
    let meta;

    const shortVenue = venueLabel(match.venue?.name);

    if (mode === "results") {
      if (perspective.isHome) {
        key = `results:home:${match.date}:${shortVenue}`;
        meta = [match.weekday, match.dateText, shortVenue];
      } else {
        key = `results:away:${match.date}`;
        meta = [match.weekday, match.dateText, "AUSWÄRTS"];
      }
      title = BRAND.resultsTitle;
    } else if (perspective.isHome) {
      key = `home:${match.date}:${shortVenue}`;
      title = BRAND.homeTitle;
      meta = [match.weekday, match.dateText, shortVenue];
    } else {
      key = `away:${match.date}`;
      title = BRAND.awayTitle;
      meta = [match.weekday, match.dateText];
    }

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title,
        meta,
        matches: []
      });
    }

    const override = matchOverrides.get(String(match.id)) || {};

    groups.get(key).matches.push({
      id: match.id,
      teamId: perspective.teamId,
      teamLabel: override.teamLabel ?? perspective.teamLabel,
      opponent: override.opponent ?? perspective.opponent?.name ?? "",
      time: override.time ?? match.time,
      isHome: perspective.isHome,
      ownScore: override.ownScore ?? perspective.ownScore,
      opponentScore: override.opponentScore ?? perspective.opponentScore,
      venue: shortVenue
    });
  }

  return [...groups.values()]
    .map((slide) => {
      slide.matches.sort((a, b) => a.time.localeCompare(b.time));
      return slide;
    })
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((slide, index) => ({
      ...slide,
      index,
      filename: `${slugify(slide.title)}-${slugify(slide.meta.join("-")) || index + 1}`
    }));
}

function renderMeta(meta) {
  return meta
    .filter(Boolean)
    .map((part, index, array) => {
      const dot = index < array.length - 1
        ? '<span class="meta-dot"></span>'
        : "";

      return `<span class="meta-part">${escapeHtml(String(part).toUpperCase())}</span>${dot}`;
    })
    .join("");
}

function headlineAssetForTitle(title = "") {
  const normalized = String(title).toUpperCase();

  const assets = {
    HEIMSPIELE: "assets/headlines/headline-home.svg",
    "AUSWÄRTSSPIELE": "assets/headlines/headline-away.svg",
    ERGEBNISSE: "assets/headlines/headline-results.svg"
  };

  return assets[normalized] ?? null;
}

function renderBreakableName(value = "") {
  return escapeHtml(value)
    .replaceAll("/", "/&#8203;")
    .replaceAll("-", "-&#8203;");
}

function renderMatchCard(match, mode) {
  const center = mode === "results"
    ? `<div class="score"><span class="score-number">${escapeHtml(match.ownScore)}</span><span class="score-separator">:</span><span class="score-number">${escapeHtml(match.opponentScore)}</span></div>`
    : `<div class="time">${escapeHtml(match.time)}</div><div class="time-label">UHR</div>`;

  const teamLabelText = String(match.teamLabel || "").trim();
  const isLongTeamLabel = teamLabelText.length > 5;
  const teamLabelClasses = ["team-label", "fit-text", "fit-text--team"];

  if (isLongTeamLabel) {
    teamLabelClasses.push("team-label--long");
  }

  return `
    <div class="match-card-shell">
      <div class="match-card ${mode === "results" ? "match-card--results" : ""}">
        <img class="match-card-bg" src="assets/canva/match-card.png" alt="" aria-hidden="true">
        <div class="match-card-rail">
          <div class="team-box">
            <img class="team-shape" src="assets/canva/team-tag.png" alt="" aria-hidden="true">
            <div class="${teamLabelClasses.join(" ")}">${escapeHtml(match.teamLabel)}</div>
          </div>
          <div class="center-box">${center}</div>
          <div class="vs-box" aria-hidden="true">
            <img class="vs-asset" src="assets/canva/vs-divider.png" alt="">
          </div>
          <div class="opponent-box">
            <div class="opponent-text fit-text fit-text--opponent">${renderBreakableName(match.opponent)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSlideDocument(slide, mode) {
  const matchCount = Math.min(Math.max(slide.matches.length, 1), 9);
  const headlineAsset = headlineAssetForTitle(slide.title);

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${escapeHtml(BASE_HREF)}">
  <title>${escapeHtml(slide.title)}</title>
  <link rel="stylesheet" href="slide.css">
</head>
<body>
  <div id="slide-root" class="slide mode-${escapeHtml(mode)} match-count-${matchCount}">
    <div class="slide-inner">
      <div class="title-wrap">
        ${headlineAsset
          ? `<img class="slide-title-image" src="${headlineAsset}" alt="${escapeHtml(slide.title)}">`
          : `<div class="slide-title-fallback">${escapeHtml(slide.title)}</div>`}
      </div>
      <div class="meta-bar">${renderMeta(slide.meta)}</div>
      <div class="matches">${slide.matches.map((match) => renderMatchCard(match, mode)).join("")}</div>
    </div>
  </div>

  <script src="vendor/html2canvas/html2canvas.min.js"></script>
  <script>
    (() => {
      const slide = document.getElementById("slide-root");
      const BASE_WIDTH = 1122;
      const BASE_HEIGHT = 1402;

      function fit() {
        const scale = Math.min(1, window.innerWidth / BASE_WIDTH);
        slide.style.transform = "scale(" + scale + ")";
        document.body.style.width = (BASE_WIDTH * scale) + "px";
        document.body.style.height = (BASE_HEIGHT * scale) + "px";
      }

      function shrinkToFit(element, { minSize = 24, step = 1 } = {}) {
        const computed = window.getComputedStyle(element);
        const baseSize = parseFloat(element.dataset.baseSize || computed.fontSize);
        const baseLine = parseFloat(computed.lineHeight) || baseSize * 0.96;

        element.style.fontSize = baseSize + "px";
        element.style.lineHeight = baseLine + "px";

        let fontSize = baseSize;
        let lineHeight = baseLine;
        let guard = 0;

        while (
          guard < 120 &&
          fontSize > minSize &&
          (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight)
        ) {
          fontSize -= step;
          lineHeight = Math.max(fontSize * 0.96, minSize);
          element.style.fontSize = fontSize + "px";
          element.style.lineHeight = lineHeight + "px";
          guard += 1;
        }
      }

      function fitTextBlocks() {
        document.querySelectorAll(".fit-text--team").forEach((element) => {
          const rawText = (element.textContent || "").replace(/\\s+/g, " ").trim();
          const isLongLabel = rawText.length > 5;

          element.style.removeProperty("font-size");
          element.style.removeProperty("line-height");

          const computed = window.getComputedStyle(element);
          const cssBaseSize = parseFloat(computed.fontSize) || 77.48;
          const targetBaseSize = isLongLabel
            ? Math.min(cssBaseSize, 63)
            : cssBaseSize;

          element.dataset.baseSize = String(targetBaseSize);
          shrinkToFit(element, {
            minSize: isLongLabel ? 40 : 52,
            step: 1
          });
        });

        document.querySelectorAll(".fit-text--opponent").forEach((element) => {
          element.style.removeProperty("font-size");
          element.style.removeProperty("line-height");

          const computed = window.getComputedStyle(element);
          const baseSize = parseFloat(computed.fontSize) || 45.7;

          let fontSize = baseSize;
          let lineHeight = fontSize * 0.9;
          let guard = 0;

          const applySize = () => {
            element.style.fontSize = fontSize + "px";
            element.style.lineHeight = lineHeight + "px";
          };

          const renderedLineCount = () => {
            const range = document.createRange();
            range.selectNodeContents(element);

            const rects = [...range.getClientRects()]
              .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
              .sort((a, b) => a.top - b.top || a.left - b.left);

            const lineTops = [];

            for (const rect of rects) {
              if (!lineTops.some((top) => Math.abs(top - rect.top) < 2)) {
                lineTops.push(rect.top);
              }
            }

            return Math.max(1, lineTops.length);
          };

          applySize();

          while (
            guard < 120 &&
            fontSize > 18 &&
            renderedLineCount() > 2
          ) {
            fontSize = Math.max(18, fontSize - 0.5);
            lineHeight = fontSize * 0.9;
            applySize();
            guard += 1;
          }
        });
      }

      function waitForImages() {
        const images = [...document.images];

        return Promise.all(
          images.map((image) => {
            if (image.complete) return Promise.resolve();

            return new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            });
          })
        );
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

      async function initializeLayout() {
        await prepareLayout();
        fit();
        window.parent.postMessage({ type: "sghnms-slide-ready" }, "*");
      }

      initializeLayout();

      window.addEventListener("resize", async () => {
        await prepareLayout();
        fit();
      });
    })();
  </script>
</body>
</html>`;
}

async function downloadPng(button, iframe, filename) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "PNG wird erstellt …";

  try {
    const renderer = iframe.contentWindow?.sghnmsRenderSlidePng;

    if (!renderer) {
      throw new Error("Slide ist noch nicht vollständig geladen.");
    }

    const iframeBlob = await renderer();

    if (!iframeBlob || typeof iframeBlob.arrayBuffer !== "function") {
      throw new Error("PNG konnte nicht erzeugt werden.");
    }

    /*
     * The renderer runs inside the iframe. A Blob created there belongs to a
     * different JavaScript realm, so `iframeBlob instanceof Blob` is false in
     * the parent page even though it is a perfectly valid Blob. Re-create it
     * in the parent realm before passing it to URL.createObjectURL().
     */
    const blob = new Blob(
      [await iframeBlob.arrayBuffer()],
      { type: iframeBlob.type || "image/png" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename || "sghnms-slide"}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    setStatus(`Download gestartet: ${filename}.png`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "PNG konnte nicht erzeugt werden.", "error");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function parseScoreOverride(value) {
  const match = String(value || "").trim().match(/^(\d{1,3})\s*[:\-]\s*(\d{1,3})$/);
  if (!match) return null;

  return {
    ownScore: Number(match[1]),
    opponentScore: Number(match[2])
  };
}

function updateMatchOverride(match, field, value) {
  const key = String(match.id);
  const current = { ...(matchOverrides.get(key) || {}) };
  const cleanValue = String(value ?? "").trim();

  if (field === "score") {
    const parsed = parseScoreOverride(cleanValue);

    if (!cleanValue) {
      delete current.ownScore;
      delete current.opponentScore;
    } else if (parsed) {
      current.ownScore = parsed.ownScore;
      current.opponentScore = parsed.opponentScore;
    } else {
      return false;
    }
  } else if (!cleanValue) {
    delete current[field];
  } else {
    current[field] = cleanValue;
  }

  if (Object.keys(current).length) {
    matchOverrides.set(key, current);
  } else {
    matchOverrides.delete(key);
  }

  return true;
}

function applyOverridesToRenderedMatch(match) {
  const override = matchOverrides.get(String(match.id)) || {};

  return {
    ...match,
    teamLabel: override.teamLabel ?? match.teamLabel,
    opponent: override.opponent ?? match.opponent,
    time: override.time ?? match.time,
    ownScore: override.ownScore ?? match.ownScore,
    opponentScore: override.opponentScore ?? match.opponentScore
  };
}

function renderOverrideRow(match, mode) {
  const rendered = applyOverridesToRenderedMatch(match);
  const resultValue = rendered.ownScore !== null && rendered.opponentScore !== null
    ? `${rendered.ownScore}:${rendered.opponentScore}`
    : "";

  return `
    <div class="override-row" data-match-id="${escapeHtml(match.id)}">
      <div class="override-row__match">
        <strong>${escapeHtml(match.teamLabel)}</strong>
        <span>vs. ${escapeHtml(match.opponent)}</span>
      </div>

      <label>
        <span>Team links</span>
        <input
          type="text"
          data-override-field="teamLabel"
          value="${escapeHtml(rendered.teamLabel)}"
          placeholder="${escapeHtml(match.teamLabel)}"
        >
      </label>

      ${mode === "results"
        ? `
          <label>
            <span>Ergebnis</span>
            <input
              type="text"
              inputmode="numeric"
              data-override-field="score"
              value="${escapeHtml(resultValue)}"
              placeholder="z. B. 24:25"
            >
          </label>
        `
        : `
          <label>
            <span>Uhrzeit</span>
            <input
              type="text"
              data-override-field="time"
              value="${escapeHtml(rendered.time)}"
              placeholder="z. B. 15:30"
            >
          </label>
        `}

      <label>
        <span>Team rechts</span>
        <input
          type="text"
          data-override-field="opponent"
          value="${escapeHtml(rendered.opponent)}"
          placeholder="${escapeHtml(match.opponent)}"
        >
      </label>

      <button class="override-reset" type="button">Zurücksetzen</button>
    </div>
  `;
}

function slideCard(slide, mode) {
  const article = document.createElement("article");
  article.className = "slide-card";
  article.innerHTML = `
    <div class="slide-card__header">
      <div>
        <h2>${escapeHtml(slide.title)}</h2>
        <p>${slide.meta.map(escapeHtml).join(" · ")}</p>
      </div>
      <div class="slide-card__actions">
        <button class="override-toggle" type="button">Overrides bearbeiten</button>
        <button class="download" type="button" disabled>PNG herunterladen</button>
      </div>
    </div>

    <div class="override-panel" hidden>
      <div class="override-panel__hint">
        Leer lassen bzw. zurücksetzen = Originalwert aus handball.net verwenden.
      </div>
      ${slide.matches.map((match) => renderOverrideRow(match, mode)).join("")}
    </div>

    <div class="preview-wrap">
      <iframe title="${escapeHtml(slide.title)}"></iframe>
    </div>
  `;

  const downloadButton = article.querySelector(".download");
  const overrideToggle = article.querySelector(".override-toggle");
  const overridePanel = article.querySelector(".override-panel");
  const iframe = article.querySelector("iframe");

  let refreshTimer = null;

  const refreshPreview = () => {
    downloadButton.disabled = true;
    iframe.srcdoc = renderSlideDocument({
      ...slide,
      matches: slide.matches.map(applyOverridesToRenderedMatch)
    }, mode);
  };

  const scheduleRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshPreview, 120);
  };

  iframe.addEventListener("load", () => {
    downloadButton.disabled = false;
  });

  overrideToggle.addEventListener("click", () => {
    const willOpen = overridePanel.hidden;
    overridePanel.hidden = !willOpen;
    overrideToggle.textContent = willOpen
      ? "Overrides schließen"
      : "Overrides bearbeiten";
  });

  overridePanel.addEventListener("input", (event) => {
    const input = event.target.closest("[data-override-field]");
    if (!input) return;

    const row = input.closest(".override-row");
    const match = slide.matches.find((item) => String(item.id) === row?.dataset.matchId);
    if (!match) return;

    const field = input.dataset.overrideField;
    const accepted = updateMatchOverride(match, field, input.value);

    input.classList.toggle("is-invalid", !accepted);

    if (accepted) {
      scheduleRefresh();
    }
  });

  overridePanel.addEventListener("click", (event) => {
    const resetButton = event.target.closest(".override-reset");
    if (!resetButton) return;

    const row = resetButton.closest(".override-row");
    const match = slide.matches.find((item) => String(item.id) === row?.dataset.matchId);
    if (!match) return;

    matchOverrides.delete(String(match.id));

    const teamInput = row.querySelector('[data-override-field="teamLabel"]');
    const opponentInput = row.querySelector('[data-override-field="opponent"]');
    const timeInput = row.querySelector('[data-override-field="time"]');
    const scoreInput = row.querySelector('[data-override-field="score"]');

    if (teamInput) teamInput.value = match.teamLabel;
    if (opponentInput) opponentInput.value = match.opponent;
    if (timeInput) timeInput.value = match.time;
    if (scoreInput) {
      scoreInput.value = match.ownScore !== null && match.opponentScore !== null
        ? `${match.ownScore}:${match.opponentScore}`
        : "";
    }

    row.querySelectorAll(".is-invalid").forEach((element) => {
      element.classList.remove("is-invalid");
    });

    refreshPreview();
  });

  refreshPreview();

  downloadButton.addEventListener("click", () => {
    downloadPng(downloadButton, iframe, slide.filename);
  });

  return article;
}

function singleSlideCard(rawMatch) {
  const article = document.createElement("article");
  article.className = "slide-card";

  const own = ownTeam(rawMatch);
  if (!own) return article;

  const baseMatch = {
    id: rawMatch.id,
    teamLabel: own.teamLabel,
    opponent: own.opponent?.name ?? "",
    time: rawMatch.time,
    ownScore: own.ownScore,
    opponentScore: own.opponentScore
  };

  const makeSlide = () => buildSingleSlide(rawMatch, {
    overrides: matchOverrides.get(String(rawMatch.id)) || {},
    logoManifest
  });

  const firstSlide = makeSlide();

  article.innerHTML = `
    <div class="slide-card__header">
      <div>
        <h2>${escapeHtml(firstSlide?.headline || "Einzelspiel")}</h2>
        <p>${escapeHtml(rawMatch.dateText)} · ${escapeHtml(rawMatch.time)} · ${escapeHtml(own.teamLabel)} vs. ${escapeHtml(own.opponent?.name || "")}</p>
        <div class="single-slide-meta">
          <span>${escapeHtml(rawMatch.competition || "")}</span>
          <span>${escapeHtml(rawMatch.phase?.name || "")}</span>
          <span>${escapeHtml(rawMatch.venue?.name || "")}</span>
        </div>
      </div>
      <div class="slide-card__actions">
        <button class="override-toggle" type="button">Overrides bearbeiten</button>
        <button class="download" type="button" disabled>PNG herunterladen</button>
      </div>
    </div>

    <div class="override-panel" hidden>
      <div class="override-panel__hint">
        Für den Prototypen gelten die bestehenden Text-Overrides auch für den Einzelspiel-Slide.
      </div>
      ${renderOverrideRow(baseMatch, "gameday")}
    </div>

    ${firstSlide && !hasLocalLogos(firstSlide)
      ? '<div class="logo-warning">Mindestens ein Vereinslogo fehlt lokal. `npm run logos:audit` im Branch ausführen; bis dahin wird ein Platzhalter angezeigt.</div>'
      : ''}

    <div class="preview-wrap">
      <iframe title="Einzelspiel"></iframe>
    </div>
  `;

  const downloadButton = article.querySelector(".download");
  const overrideToggle = article.querySelector(".override-toggle");
  const overridePanel = article.querySelector(".override-panel");
  const iframe = article.querySelector("iframe");
  let refreshTimer = null;

  const refreshPreview = () => {
    const currentSlide = makeSlide();
    downloadButton.disabled = true;
    iframe.srcdoc = renderSingleSlideDocument(currentSlide, BASE_HREF);
  };

  const scheduleRefresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshPreview, 120);
  };

  iframe.addEventListener("load", () => {
    downloadButton.disabled = false;
  });

  overrideToggle.addEventListener("click", () => {
    const willOpen = overridePanel.hidden;
    overridePanel.hidden = !willOpen;
    overrideToggle.textContent = willOpen ? "Overrides schließen" : "Overrides bearbeiten";
  });

  overridePanel.addEventListener("input", (event) => {
    const input = event.target.closest("[data-override-field]");
    if (!input) return;

    const field = input.dataset.overrideField;
    const accepted = updateMatchOverride(baseMatch, field, input.value);
    input.classList.toggle("is-invalid", !accepted);
    if (accepted) scheduleRefresh();
  });

  overridePanel.addEventListener("click", (event) => {
    const resetButton = event.target.closest(".override-reset");
    if (!resetButton) return;

    matchOverrides.delete(String(rawMatch.id));
    const row = resetButton.closest(".override-row");
    const teamInput = row.querySelector('[data-override-field="teamLabel"]');
    const opponentInput = row.querySelector('[data-override-field="opponent"]');
    const timeInput = row.querySelector('[data-override-field="time"]');

    if (teamInput) teamInput.value = baseMatch.teamLabel;
    if (opponentInput) opponentInput.value = baseMatch.opponent;
    if (timeInput) timeInput.value = baseMatch.time;
    row.querySelectorAll(".is-invalid").forEach((element) => element.classList.remove("is-invalid"));
    refreshPreview();
  });

  refreshPreview();

  downloadButton.addEventListener("click", () => {
    const currentSlide = makeSlide();
    downloadPng(downloadButton, iframe, currentSlide.filename);
  });

  return article;
}

async function loadData() {
  submitButton.disabled = true;
  setStatus("Spieldaten werden geladen …", "loading");

  const response = await fetch("./data/matches.json", {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Spieldaten konnten nicht geladen werden (HTTP ${response.status}).`);
  }

  const data = await response.json();

  if (!Array.isArray(data.matches)) {
    throw new Error("Ungültiges Datenformat in matches.json.");
  }

  dataSet = data;

  try {
    const logoResponse = await fetch("./data/club-logos.json", { cache: "no-store" });
    if (logoResponse.ok) {
      const parsed = await logoResponse.json();
      if (parsed?.clubs && parsed?.teams) logoManifest = parsed;
    }
  } catch (error) {
    console.warn("Logo-Manifest konnte nicht geladen werden:", error);
  }

  submitButton.disabled = false;
  refreshSingleMatchOptions();

  const generatedAt = data.generatedAt
    ? new Intl.DateTimeFormat("de-DE", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(data.generatedAt))
    : "noch nicht aktualisiert";

  const seasonText = data.season?.dateFrom && data.season?.dateTo
    ? `${data.season.dateFrom} bis ${data.season.dateTo}`
    : "keine Saisondaten";

  dataInfo.textContent = `Datenstand: ${generatedAt} · ${data.matches.length} Spiele · Saison: ${seasonText}`;
  setStatus("Zeitraum auswählen und Slides generieren.");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!dataSet) {
    setStatus("Spieldaten sind noch nicht geladen.", "error");
    return;
  }

  const from = fromInput.value;
  const to = toInput.value;
  const mode = modeInput.value;

  if (!from || !to || from > to) {
    setStatus("Bitte einen gültigen Zeitraum auswählen.", "error");
    return;
  }

  const filteredMatches = dataSet.matches.filter((match) =>
    match.date >= from && match.date <= to
  );

  slides.innerHTML = "";

  if (mode === "single") {
    const selected = filteredMatches.find(
      (match) => String(match.id) === String(singleMatchInput.value)
    );

    if (!selected || !ownTeam(selected)) {
      setStatus("Bitte ein gültiges SG-Spiel auswählen.", "empty");
      return;
    }

    slides.appendChild(singleSlideCard(selected));
    setStatus("Einzelspiel-Slide erzeugt.", "success");
    return;
  }

  const generatedSlides = buildSlides(filteredMatches, mode);

  if (!generatedSlides.length) {
    setStatus("Für den Zeitraum wurden keine passenden Slides gefunden.", "empty");
    return;
  }

  generatedSlides.forEach((slide) => {
    slides.appendChild(slideCard(slide, mode));
  });

  setStatus(`${generatedSlides.length} Slide(s) erzeugt.`, "success");
});

modeInput.addEventListener("change", refreshSingleMatchOptions);
fromInput.addEventListener("change", refreshSingleMatchOptions);
toInput.addEventListener("change", refreshSingleMatchOptions);

setDefaultRange();

loadData().catch((error) => {
  console.error(error);
  submitButton.disabled = true;
  dataInfo.textContent = "Spieldaten konnten nicht geladen werden.";
  setStatus(error.message || "Spieldaten konnten nicht geladen werden.", "error");
});
