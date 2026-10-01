import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  BRAND,
  CACHE_TTL,
  CLUB_ID,
  HANDBALL_BASE,
  TEAM_LABELS,
  VENUE_LABELS
} from "./config.js";

const PORT = Number(process.env.PORT || 3000);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");

const app = express();
app.use(express.static(PUBLIC_DIR));

const cache = new Map();
let cachedClientToken = null;

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/151.0.0.0 Safari/537.36";

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

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() >= item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCached(key, data) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + CACHE_TTL
  });
}

function clientTokenIsValid(token) {
  if (!token) return false;
  const expiry = Number(token.split(".")[0]);
  return Number.isFinite(expiry) && Date.now() < expiry - 60_000;
}

async function getClientToken(forceRefresh = false) {
  if (!forceRefresh && clientTokenIsValid(cachedClientToken)) {
    return cachedClientToken;
  }

  const response = await fetch(`${HANDBALL_BASE}/club/${CLUB_ID}`, {
    headers: {
      Accept: "text/html",
      "User-Agent": BROWSER_USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Club-Seite liefert HTTP ${response.status}`);
  }

  const html = await response.text();
  const metaTag = html.match(
    /<meta\b[^>]*name=["']client-token["'][^>]*>/i
  )?.[0];
  const token = metaTag?.match(/\bcontent=["']([^"']+)["']/i)?.[1];

  if (!token) {
    throw new Error("client-token konnte nicht gefunden werden");
  }

  cachedClientToken = token;
  return token;
}

async function fetchClubPage({ from, to, page, retry = true }) {
  const token = await getClientToken();
  const params = new URLSearchParams({
    club_id: CLUB_ID,
    per_page: "100",
    page: String(page),
    date_from: from,
    date_to: to
  });

  const response = await fetch(`${HANDBALL_BASE}/api/new/matches?${params}`, {
    headers: {
      Accept: "application/json",
      Referer: `${HANDBALL_BASE}/club/${CLUB_ID}`,
      "X-Client-Token": token,
      "User-Agent": BROWSER_USER_AGENT
    }
  });

  if (response.ok) {
    return response.json();
  }

  const errorText = await response.text();
  let errorJson = null;
  try {
    errorJson = JSON.parse(errorText);
  } catch {
    // response was not JSON
  }

  if (
    retry &&
    response.status === 403 &&
    errorJson?.code === "CLIENT_TOKEN_EXPIRED"
  ) {
    cachedClientToken = null;
    await getClientToken(true);
    return fetchClubPage({ from, to, page, retry: false });
  }

  throw new Error(
    `handball.net liefert HTTP ${response.status}: ${errorText.slice(0, 200)}`
  );
}

function berlinParts(isoDate) {
  const date = new Date(isoDate);

  const dateText = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Berlin"
  }).format(date);

  const weekday = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    timeZone: "Europe/Berlin"
  }).format(date);

  const time = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Berlin"
  }).format(date);

  const isoLocal = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Berlin"
  }).format(date);

  return {
    dateText,
    weekday,
    time,
    isoLocal
  };
}

function normalizeMatch(raw) {
  const formatted = berlinParts(raw.date);

  return {
    id: raw.id,
    datetime: raw.date,
    date: formatted.isoLocal,
    dateText: formatted.dateText,
    weekday: formatted.weekday,
    time: formatted.time,
    home: {
      id: raw.local?.id ?? null,
      name: raw.local?.name ?? "",
      clubId: raw.local?.club?.id ?? null
    },
    away: {
      id: raw.visitor?.id ?? null,
      name: raw.visitor?.name ?? "",
      clubId: raw.visitor?.club?.id ?? null
    },
    result: {
      home: raw.result?.local ?? null,
      away: raw.result?.visitor ?? null
    },
    status: {
      finished: Boolean(raw.status?.is_finished),
      live: Boolean(raw.status?.is_live)
    },
    venue: {
      name: raw.field?.name ?? "",
      address: raw.field?.installation?.address ?? ""
    },
    phase: {
      id: raw.phase?.id ?? null,
      name: raw.phase?.name ?? ""
    },
    competition: raw.phase?.competition?.name ?? ""
  };
}

async function getMatches(from, to) {
  const cacheKey = `${from}:${to}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const all = [];
  let page = 1;
  let lastPage = 1;

  do {
    const payload = await fetchClubPage({ from, to, page });
    if (Array.isArray(payload.data)) {
      all.push(...payload.data.map(normalizeMatch));
    }
    lastPage = Number(payload.pagination?.last_page || 1);
    page += 1;
  } while (page <= lastPage);

  all.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
  setCached(cacheKey, all);
  return all;
}

function venueLabel(name) {
  const key = String(name || "").trim().toUpperCase();
  return VENUE_LABELS[key] || String(name || "").trim();
}

function ownTeam(match) {
  const homeId = String(match.home.id ?? "");
  const awayId = String(match.away.id ?? "");

  if (TEAM_LABELS[homeId]) {
    return {
      isHome: true,
      teamId: homeId,
      teamLabel: TEAM_LABELS[homeId],
      opponent: match.away,
      ownScore: match.result.home,
      opponentScore: match.result.away
    };
  }

  if (TEAM_LABELS[awayId]) {
    return {
      isHome: false,
      teamId: awayId,
      teamLabel: TEAM_LABELS[awayId],
      opponent: match.home,
      ownScore: match.result.away,
      opponentScore: match.result.home
    };
  }

  return null;
}

function isFinished(match) {
  return (
    match.status.finished ||
    (match.result.home !== null && match.result.away !== null)
  );
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

    if (mode === "results") {
      key = `results:${match.date}`;
      title = BRAND.resultsTitle;
      meta = [match.weekday, match.dateText];
    } else if (perspective.isHome) {
      const shortVenue = venueLabel(match.venue.name);
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

    groups.get(key).matches.push({
      id: match.id,
      teamId: perspective.teamId,
      teamLabel: perspective.teamLabel,
      opponent: perspective.opponent.name,
      time: match.time,
      isHome: perspective.isHome,
      ownScore: perspective.ownScore,
      opponentScore: perspective.opponentScore,
      venue: venueLabel(match.venue.name)
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
      const dot = index < array.length - 1 ? '<span class="meta-dot"></span>' : "";
      return `<span class="meta-part">${escapeHtml(String(part).toUpperCase())}</span>${dot}`;
    })
    .join("");
}

function renderMatchCard(match, mode) {
  const center =
    mode === "results"
      ? `<div class="score">${escapeHtml(match.ownScore)}<span>:</span>${escapeHtml(match.opponentScore)}</div>`
      : `<div class="time">${escapeHtml(match.time)}</div><div class="time-label">UHR</div>`;

  return `
    <div class="match-card">
      <div class="team-box">
        <div class="team-label">${escapeHtml(match.teamLabel)}</div>
      </div>
      <div class="center-box">${center}</div>
      <div class="vs-box"><span>VS</span></div>
      <div class="opponent-box">${escapeHtml(match.opponent)}</div>
    </div>
  `;
}

function renderSlideHtml(slide, mode) {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(slide.title)}</title>
  <link rel="stylesheet" href="/slide.css">
</head>
<body>
  <div id="slide-root" class="slide">
    <div class="slide-inner">
      <div class="brand-mark">SG HANDBALL<br>NEUMÜNSTER</div>
      <h1>${escapeHtml(slide.title)}</h1>
      <div class="meta-bar">${renderMeta(slide.meta)}</div>
      <div class="matches">${slide.matches.map((m) => renderMatchCard(m, mode)).join("")}</div>
    </div>
  </div>
  <script>
    (() => {
      const slide = document.getElementById("slide-root");
      const BASE_WIDTH = 1080;
      const BASE_HEIGHT = 1350;
      function fit() {
        const scale = Math.min(1, window.innerWidth / BASE_WIDTH);
        slide.style.transform = "scale(" + scale + ")";
        document.body.style.height = (BASE_HEIGHT * scale) + "px";
      }
      fit();
      window.addEventListener("resize", fit);
    })();
  </script>
</body>
</html>`;
}

function validateQuery(req, res) {
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  const mode = String(req.query.mode || "gameday");

  if (!isIsoDate(from) || !isIsoDate(to)) {
    res.status(400).json({ error: "Start- und Enddatum müssen im Format YYYY-MM-DD vorliegen." });
    return null;
  }

  if (from > to) {
    res.status(400).json({ error: "Das Startdatum darf nicht nach dem Enddatum liegen." });
    return null;
  }

  if (!['gameday', 'results'].includes(mode)) {
    res.status(400).json({ error: "Ungültige Variante." });
    return null;
  }

  return { from, to, mode };
}

async function slidesForQuery(from, to, mode) {
  const matches = await getMatches(from, to);
  return buildSlides(matches, mode);
}

app.get("/api/slides", async (req, res) => {
  try {
    const query = validateQuery(req, res);
    if (!query) return;

    const slides = await slidesForQuery(query.from, query.to, query.mode);
    res.json({ slides });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Slides konnten nicht erzeugt werden." });
  }
});

app.get("/slide", async (req, res) => {
  try {
    const query = validateQuery(req, res);
    if (!query) return;

    const index = Number(req.query.index || 0);
    const slides = await slidesForQuery(query.from, query.to, query.mode);
    const slide = slides[index];

    if (!slide) {
      return res.status(404).send("Slide nicht gefunden.");
    }

    res.type("html").send(renderSlideHtml(slide, query.mode));
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message || "Slide konnte nicht erzeugt werden.");
  }
});

app.get("/api/download-png", async (req, res) => {
  let browser = null;

  try {
    const query = validateQuery(req, res);
    if (!query) return;

    const index = Number(req.query.index || 0);
    const slides = await slidesForQuery(query.from, query.to, query.mode);
    const slide = slides[index];

    if (!slide) {
      return res.status(404).send("Slide nicht gefunden.");
    }

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1350 },
      deviceScaleFactor: 1
    });

    const params = new URLSearchParams({
      mode: query.mode,
      from: query.from,
      to: query.to,
      index: String(index)
    });

    await page.goto(`http://127.0.0.1:${PORT}/slide?${params}`, {
      waitUntil: "networkidle"
    });

    const png = await page.locator("#slide-root").screenshot({ type: "png" });

    res.setHeader("Content-Type", "image/png");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${slide.filename}.png"`
    );
    res.send(png);
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message || "PNG konnte nicht erzeugt werden.");
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`Handball Social Generator läuft auf Port ${PORT}`);
});
