import { BRAND } from "./config.js";
import {
  escapeHtml,
  isFinishedMatch as isFinished,
  ownTeamPerspective as ownTeam,
  renderBreakableName,
  slugify,
  venueLabel
} from "./match-utils.js";
import {
  buildSingleSlide,
  hasLocalLogos,
  renderSingleSlideDocument,
  singleMatchOptionLabel
} from "./single-match.js";

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

const SPONSOR_ASSETS = Object.freeze({
  post: {
    src: "assets/sghnms_images/sponsor_post.png",
    filename: "sponsoren-sghnms-beitrag",
    label: "Instagram Beitrag"
  },
  story: {
    src: "assets/sghnms_images/sponsor_story.png",
    filename: "sponsoren-sghnms-story",
    label: "Instagram Story"
  }
});

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
  const isSingle = modeInput.value === "single" || modeInput.value === "single-result";
  const isSingleResult = modeInput.value === "single-result";
  singleMatchField.hidden = !isSingle;
  form.classList.toggle("controls--single", isSingle);

  if (!isSingle || !dataSet?.matches) return;

  const from = fromInput.value;
  const to = toInput.value;
  const currentValue = singleMatchInput.value;

  const options = dataSet.matches
    .filter((match) => (!from || match.date >= from) && (!to || match.date <= to))
    .filter((match) => !isSingleResult || isFinished(match))
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

function setStatus(message, type = "") {
  status.textContent = message;
  status.className = `status ${type}`.trim();
}

function currentOutputFormat() {
  return document.querySelector("#format")?.value === "story" ? "story" : "post";
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function fetchAssetBlob(src) {
  const response = await fetch(new URL(src, BASE_HREF), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Asset konnte nicht geladen werden (HTTP ${response.status}).`);
  }
  return response.blob();
}

async function waitForSlideRenderer(iframe, timeoutMs = 10000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const renderer = iframe.contentWindow?.sghnmsRenderSlidePng;
    if (typeof renderer === "function") return renderer;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  throw new Error("Mindestens ein Slide ist noch nicht vollständig geladen.");
}

async function renderIframePngBlob(iframe) {
  const renderer = await waitForSlideRenderer(iframe);
  const iframeBlob = await renderer();

  if (!iframeBlob || typeof iframeBlob.arrayBuffer !== "function") {
    throw new Error("PNG konnte nicht erzeugt werden.");
  }

  return new Blob(
    [await iframeBlob.arrayBuffer()],
    { type: iframeBlob.type || "image/png" }
  );
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let k = 0; k < 8; k += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = ((date.getHours() & 0x1f) << 11)
    | ((date.getMinutes() & 0x3f) << 5)
    | ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9)
    | (((date.getMonth() + 1) & 0x0f) << 5)
    | (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

async function createZipBlob(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const { dosTime, dosDate } = dosDateTime();
  let offset = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const bytes = new Uint8Array(await entry.blob.arrayBuffer());
    const checksum = crc32(bytes);

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, bytes.length, true);
    centralView.setUint32(24, bytes.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    localParts.push(local, bytes);
    centralParts.push(central);
    offset += local.length + bytes.length;
    centralSize += central.length;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

function sponsorSlideCard(format) {
  const sponsor = SPONSOR_ASSETS[format] || SPONSOR_ASSETS.post;
  const article = document.createElement("article");
  article.className = `slide-card sponsor-card ${format === "story" ? "sponsor-card--story" : ""}`.trim();
  article.dataset.downloadKind = "asset";
  article.dataset.downloadUrl = sponsor.src;
  article.dataset.downloadFilename = sponsor.filename;

  article.innerHTML = `
    <div class="slide-card__header">
      <div>
        <h2>SPONSOREN</h2>
        <p>Abschluss-Slide · ${escapeHtml(sponsor.label)}</p>
      </div>
      <div class="slide-card__actions">
        <button class="download sponsor-download" type="button">PNG herunterladen</button>
      </div>
    </div>

    <div class="sponsor-preview-wrap">
      <img class="sponsor-preview" src="${escapeHtml(sponsor.src)}" alt="SGHNMS Sponsoren">
    </div>
  `;

  const button = article.querySelector(".sponsor-download");
  button.addEventListener("click", async () => {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "PNG wird geladen …";

    try {
      const blob = await fetchAssetBlob(sponsor.src);
      triggerBlobDownload(blob, `${sponsor.filename}.png`);
      setStatus(`Download gestartet: ${sponsor.filename}.png`, "success");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Sponsoren-Slide konnte nicht geladen werden.", "error");
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });

  return article;
}

async function downloadAllSlides(button, { mode, format, from, to }) {
  const originalText = button.textContent;
  button.disabled = true;

  try {
    const cards = [...slides.querySelectorAll(".slide-card[data-download-kind]")];
    if (!cards.length) {
      throw new Error("Keine Slides zum Herunterladen vorhanden.");
    }

    const files = [];

    for (let index = 0; index < cards.length; index += 1) {
      const card = cards[index];
      const order = String(index + 1).padStart(2, "0");
      const baseFilename = card.dataset.downloadFilename || `slide-${index + 1}`;
      button.textContent = `Erstelle ${index + 1}/${cards.length} …`;
      setStatus(`Download-Paket wird erstellt: Slide ${index + 1} von ${cards.length} …`, "loading");

      let blob;
      if (card.dataset.downloadKind === "asset") {
        blob = await fetchAssetBlob(card.dataset.downloadUrl);
      } else {
        const iframe = card.querySelector("iframe");
        if (!iframe) throw new Error("Slide-Preview konnte nicht gefunden werden.");
        blob = await renderIframePngBlob(iframe);
      }

      files.push({
        name: `${order}-${baseFilename}.png`,
        blob
      });
    }

    button.textContent = "ZIP wird erstellt …";
    const zip = await createZipBlob(files);
    const modeLabel = mode === "results" ? "ergebnisse" : "spieltag";
    const zipFilename = `sghnms-${modeLabel}-${from}-bis-${to}-${format}.zip`;
    triggerBlobDownload(zip, zipFilename);
    setStatus(`${files.length} Dateien als ${zipFilename} heruntergeladen.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Download-Paket konnte nicht erstellt werden.", "error");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function bulkDownloadBar({ mode, format, from, to }) {
  const wrapper = document.createElement("div");
  wrapper.className = "bulk-actions";
  wrapper.innerHTML = `
    <div>
      <strong>Alle Slides herunterladen</strong>
      <span>inkl. Sponsoren-Slide als letzte Datei</span>
    </div>
    <button class="download download-all" type="button">Download All</button>
  `;

  const button = wrapper.querySelector(".download-all");
  button.addEventListener("click", () => {
    downloadAllSlides(button, { mode, format, from, to });
  });

  return wrapper;
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
    const blob = await renderIframePngBlob(iframe);
    triggerBlobDownload(blob, `${filename || "sghnms-slide"}.png`);
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
    first: Number(match[1]),
    second: Number(match[2])
  };
}

function saveOverride(key, current) {
  if (Object.keys(current).length) {
    matchOverrides.set(key, current);
  } else {
    matchOverrides.delete(key);
  }
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
      current.ownScore = parsed.first;
      current.opponentScore = parsed.second;
    } else {
      return false;
    }
  } else if (!cleanValue) {
    delete current[field];
  } else {
    current[field] = cleanValue;
  }

  saveOverride(key, current);
  return true;
}

function updateSingleScoreOverride(matchId, isHome, value) {
  const key = String(matchId);
  const current = { ...(matchOverrides.get(key) || {}) };
  const cleanValue = String(value ?? "").trim();
  const parsed = parseScoreOverride(cleanValue);

  if (!cleanValue) {
    delete current.ownScore;
    delete current.opponentScore;
  } else if (!parsed) {
    return false;
  } else if (isHome) {
    current.ownScore = parsed.first;
    current.opponentScore = parsed.second;
  } else {
    current.opponentScore = parsed.first;
    current.ownScore = parsed.second;
  }

  saveOverride(key, current);
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

function renderSingleOverrideRow(rawMatch, perspective, resultMode) {
  const override = matchOverrides.get(String(rawMatch.id)) || {};
  const teamLabel = override.teamLabel ?? perspective.teamLabel;
  const opponent = override.opponent ?? perspective.opponent?.name ?? "";
  const time = override.time ?? rawMatch.time;
  const ownScore = override.ownScore ?? perspective.ownScore;
  const opponentScore = override.opponentScore ?? perspective.opponentScore;
  const homeScore = perspective.isHome ? ownScore : opponentScore;
  const awayScore = perspective.isHome ? opponentScore : ownScore;
  const resultValue = homeScore !== null && awayScore !== null
    ? `${homeScore}:${awayScore}`
    : "";

  return `
    <div class="override-row" data-match-id="${escapeHtml(rawMatch.id)}">
      <div class="override-row__match">
        <strong>${escapeHtml(rawMatch.home?.name || "Heimteam")}</strong>
        <span>vs. ${escapeHtml(rawMatch.away?.name || "Auswärtsteam")}</span>
      </div>

      <label>
        <span>SG-Team im Meta</span>
        <input
          type="text"
          data-override-field="teamLabel"
          value="${escapeHtml(teamLabel)}"
          placeholder="${escapeHtml(perspective.teamLabel)}"
        >
      </label>

      ${resultMode
        ? `
          <label>
            <span>Ergebnis (Heim:Auswärts)</span>
            <input
              type="text"
              inputmode="numeric"
              data-override-field="singleScore"
              value="${escapeHtml(resultValue)}"
              placeholder="z. B. 10:5"
            >
          </label>
        `
        : `
          <label>
            <span>Uhrzeit</span>
            <input
              type="text"
              data-override-field="time"
              value="${escapeHtml(time)}"
              placeholder="z. B. 15:30"
            >
          </label>
        `}

      <label>
        <span>Gegnername</span>
        <input
          type="text"
          data-override-field="opponent"
          value="${escapeHtml(opponent)}"
          placeholder="${escapeHtml(perspective.opponent?.name || "")}"
        >
      </label>

      <button class="override-reset" type="button">Zurücksetzen</button>
    </div>
  `;
}

function slideCard(slide, mode) {
  const article = document.createElement("article");
  article.className = "slide-card";
  article.dataset.downloadKind = "rendered";
  article.dataset.downloadFilename = slide.filename;
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
      : "Overrides bearbeiten";  });

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

function singleSlideCard(rawMatch, { resultMode = false } = {}) {
  const article = document.createElement("article");
  article.className = "slide-card";

  const own = ownTeam(rawMatch);
  if (!own) return article;

  const makeSlide = () => buildSingleSlide(rawMatch, {
    overrides: matchOverrides.get(String(rawMatch.id)) || {},
    logoManifest,
    resultMode
  });

  const firstSlide = makeSlide();
  const headerValue = resultMode && rawMatch.result
    ? `${rawMatch.result.home}:${rawMatch.result.away}`
    : rawMatch.time;

  article.innerHTML = `
    <div class="slide-card__header">
      <div>
        <h2>${escapeHtml(firstSlide?.headline || "Einzelspiel")}</h2>
        <p>${escapeHtml(rawMatch.dateText)} · ${escapeHtml(headerValue)} · ${escapeHtml(rawMatch.home?.name || "")} vs. ${escapeHtml(rawMatch.away?.name || "")}</p>
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
        ${resultMode
          ? "Ergebnis wird immer als Heim:Auswärts eingegeben. Namen und SG-Teambezeichnung können separat angepasst werden."
          : "SG-Teambezeichnung im Meta-Block, Uhrzeit und Gegnername können für diesen Slide angepasst werden."}
      </div>
      ${renderSingleOverrideRow(rawMatch, own, resultMode)}
    </div>

    ${firstSlide && !hasLocalLogos(firstSlide)
      ? '<div class="logo-warning">Mindestens ein Vereinslogo fehlt lokal. `npm run logos:sync` ausführen; bis dahin wird ein Platzhalter angezeigt.</div>'
      : ''}

    <div class="preview-wrap">
      <iframe title="${resultMode ? "Einzelergebnis" : "Einzelspiel"}"></iframe>
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
    const accepted = field === "singleScore"
      ? updateSingleScoreOverride(rawMatch.id, own.isHome, input.value)
      : updateMatchOverride({ id: rawMatch.id }, field, input.value);

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
    const scoreInput = row.querySelector('[data-override-field="singleScore"]');

    if (teamInput) teamInput.value = own.teamLabel;
    if (opponentInput) opponentInput.value = own.opponent?.name ?? "";
    if (timeInput) timeInput.value = rawMatch.time;
    if (scoreInput) {
      scoreInput.value = rawMatch.result?.home !== null && rawMatch.result?.away !== null
        ? `${rawMatch.result.home}:${rawMatch.result.away}`
        : "";
    }

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
  const format = currentOutputFormat();

  if (!from || !to || from > to) {
    setStatus("Bitte einen gültigen Zeitraum auswählen.", "error");
    return;
  }

  const filteredMatches = dataSet.matches.filter((match) =>
    match.date >= from && match.date <= to
  );

  slides.innerHTML = "";

  if (mode === "single" || mode === "single-result") {
    const resultMode = mode === "single-result";
    const selected = filteredMatches.find(
      (match) => String(match.id) === String(singleMatchInput.value)
    );

    if (!selected || !ownTeam(selected)) {
      setStatus("Bitte ein gültiges SG-Spiel auswählen.", "empty");
      return;
    }

    if (resultMode && !isFinished(selected)) {
      setStatus("Für das ausgewählte Spiel liegt noch kein abgeschlossenes Ergebnis vor.", "empty");
      return;
    }

    slides.appendChild(singleSlideCard(selected, { resultMode }));
    slides.appendChild(sponsorSlideCard(format));
    setStatus(
      resultMode
        ? "Einzelergebnis-Slide + Sponsoren-Slide erzeugt."
        : "Einzelspiel-Slide + Sponsoren-Slide erzeugt.",
      "success"
    );
    return;
  }

  const generatedSlides = buildSlides(filteredMatches, mode);

  if (!generatedSlides.length) {
    setStatus("Für den Zeitraum wurden keine passenden Slides gefunden.", "empty");
    return;
  }

  slides.appendChild(bulkDownloadBar({ mode, format, from, to }));

  generatedSlides.forEach((slide) => {
    slides.appendChild(slideCard(slide, mode));
  });

  slides.appendChild(sponsorSlideCard(format));

  setStatus(
    `${generatedSlides.length} Spiel-Slide(s) + 1 Sponsoren-Slide erzeugt.`,
    "success"
  );
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