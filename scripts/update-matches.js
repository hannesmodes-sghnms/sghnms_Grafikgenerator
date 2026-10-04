import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLUB_ID, HANDBALL_BASE } from "../public/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_FILE = path.join(__dirname, "..", "public", "data", "matches.json");

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/151.0.0.0 Safari/537.36";

let cachedClientToken = null;

function getSeasonRange(now = new Date()) {
  const berlinYear = Number(
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      timeZone: "Europe/Berlin"
    }).format(now)
  );

  const berlinMonth = Number(
    new Intl.DateTimeFormat("en-CA", {
      month: "2-digit",
      timeZone: "Europe/Berlin"
    }).format(now)
  );

  const seasonStartYear = berlinMonth >= 7 ? berlinYear : berlinYear - 1;

  return {
    dateFrom: `${seasonStartYear}-09-01`,
    dateTo: `${seasonStartYear + 1}-06-30`
  };
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
  const metaTag = html.match(/<meta\b[^>]*name=["']client-token["'][^>]*>/i)?.[0];
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
    // keep text response for error output
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
    `handball.net liefert HTTP ${response.status}: ${errorText.slice(0, 300)}`
  );
}

/*
 * handball.net liefert die Spielzeit im API-Feld `date` als lokale
 * Spielzeit, obwohl der String wie ein UTC-Zeitstempel aussehen kann.
 * Ein `new Date(...)+Europe/Berlin` verschiebt die Uhrzeit deshalb im Sommer
 * um +2 Stunden (z. B. 10:00 -> 12:00).
 *
 * Fuer Datum und Uhrzeit lesen wir deshalb die Wall-Clock-Komponenten direkt
 * aus dem API-String. Nur der Wochentag wird aus diesen Komponenten berechnet.
 */
function handballDateParts(value) {
  const raw = String(value || "").trim();
  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/
  );

  if (match) {
    const [, year, month, day, hour, minute] = match;
    const weekdayDate = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0)
    );

    return {
      dateText: `${day}.${month}.${year}`,
      weekday: new Intl.DateTimeFormat("de-DE", {
        weekday: "long",
        timeZone: "UTC"
      }).format(weekdayDate),
      time: `${hour}:${minute}`,
      isoLocal: `${year}-${month}-${day}`
    };
  }

  // Fallback fuer den Fall, dass handball.net das Datumsformat aendert.
  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Unbekanntes Datumsformat von handball.net: ${raw}`);
  }

  return {
    dateText: new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Europe/Berlin"
    }).format(date),

    weekday: new Intl.DateTimeFormat("de-DE", {
      weekday: "long",
      timeZone: "Europe/Berlin"
    }).format(date),

    time: new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/Berlin"
    }).format(date),

    isoLocal: new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Europe/Berlin"
    }).format(date)
  };
}

function normalizeMatch(raw) {
  const formatted = handballDateParts(raw.date);

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

function sortKey(match) {
  return `${match.date}T${match.time}`;
}

async function fetchSeasonMatches(dateFrom, dateTo) {
  const all = [];
  let page = 1;
  let lastPage = 1;

  do {
    const payload = await fetchClubPage({
      from: dateFrom,
      to: dateTo,
      page
    });

    if (Array.isArray(payload.data)) {
      all.push(...payload.data.map(normalizeMatch));
    }

    lastPage = Number(payload.pagination?.last_page || 1);
    page += 1;
  } while (page <= lastPage);

  all.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  return all;
}

async function main() {
  const { dateFrom, dateTo } = getSeasonRange();

  console.log(`Lade handball.net Daten ${dateFrom} bis ${dateTo} ...`);
  const matches = await fetchSeasonMatches(dateFrom, dateTo);

  const payload = {
    generatedAt: new Date().toISOString(),
    season: {
      dateFrom,
      dateTo
    },
    matches
  };

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`${matches.length} Spiele nach ${OUTPUT_FILE} geschrieben.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
