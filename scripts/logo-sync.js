import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");

const MATCHES_FILE = path.join(ROOT, "public", "data", "matches.json");
const MANIFEST_FILE = path.join(ROOT, "public", "data", "club-logos.json");
const LOGO_ROOT = path.join(ROOT, "public", "assets", "club-logos");
const RAW_DIR = path.join(LOGO_ROOT, "raw");
const OVERRIDE_DIR = path.join(LOGO_ROOT, "overrides");

const FORCE = process.argv.includes("--force");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/151.0.0.0 Safari/537.36";

function normalizeKey(team) {
  return String(team.clubId ?? `team-${team.id}`);
}

function safeExt(format = "bin") {
  if (format === "jpeg") return "jpg";
  if (["png", "jpg", "webp", "gif", "avif", "svg"].includes(format)) return format;
  return "bin";
}

function htmlDecode(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll("&#47;", "/");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function findLogoUrl(teamId) {
  const response = await fetch(`https://www.handball.net/team/${teamId}`, {
    headers: {
      Accept: "text/html",
      "User-Agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Teamseite ${teamId} liefert HTTP ${response.status}`);
  }

  const html = await response.text();
  const candidates = html.match(
    /https:\/\/handball360\.isquad\.de\/images\/afiliacion_clubs\/[^"'<>\s]+/gi
  ) || [];

  return candidates.length ? htmlDecode(candidates[0]) : null;
}

async function downloadBuffer(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": USER_AGENT,
      Referer: "https://www.handball.net/"
    }
  });

  if (!response.ok) {
    throw new Error(`Logo liefert HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function collectTeams(matches) {
  const teams = new Map();

  for (const match of matches) {
    for (const team of [match.home, match.away]) {
      if (!team?.id) continue;

      const id = String(team.id);
      if (!teams.has(id)) {
        teams.set(id, {
          id,
          name: team.name || id,
          clubId: team.clubId ?? null
        });
      }
    }
  }

  return [...teams.values()];
}

async function findExistingRawFile(key, clubEntry = {}) {
  if (clubEntry.rawFile) {
    const absolute = path.join(ROOT, "public", clubEntry.rawFile);
    if (await fileExists(absolute)) return clubEntry.rawFile;
  }

  try {
    const names = await fs.readdir(RAW_DIR);
    const match = names.find((name) => name.startsWith(`${key}.`));
    return match ? `assets/club-logos/raw/${match}` : null;
  } catch {
    return null;
  }
}

async function main() {
  const matchesPayload = await loadJson(MATCHES_FILE, null);

  if (!matchesPayload?.matches?.length) {
    throw new Error("Keine Spieldaten gefunden. Erst `npm run update:data` ausfuehren.");
  }

  await fs.mkdir(RAW_DIR, { recursive: true });
  await fs.mkdir(OVERRIDE_DIR, { recursive: true });

  const existingManifest = await loadJson(MANIFEST_FILE, {
    generatedAt: null,
    clubs: {},
    teams: {}
  });

  const clubs = { ...(existingManifest.clubs || {}) };
  const teamMap = { ...(existingManifest.teams || {}) };
  const report = [];

  for (const team of collectTeams(matchesPayload.matches)) {
    const key = normalizeKey(team);
    teamMap[String(team.id)] = key;

    const previous = clubs[key] || {};
    const overrideRelative = `assets/club-logos/overrides/${key}.png`;
    const overrideAbsolute = path.join(ROOT, "public", overrideRelative);
    const hasOverride = await fileExists(overrideAbsolute);

    let rawRelative = !FORCE ? await findExistingRawFile(key, previous) : null;
    let sourceUrl = previous.sourceUrl || null;
    let metadata = null;

    if (!rawRelative) {
      try {
        sourceUrl = await findLogoUrl(team.id);

        if (!sourceUrl) {
          clubs[key] = {
            ...previous,
            key,
            clubId: team.clubId,
            names: [...new Set([...(previous.names || []), team.name])],
            sourceUrl: null,
            rawFile: null,
            overrideAsset: hasOverride ? overrideRelative : null,
            asset: hasOverride ? overrideRelative : null,
            status: hasOverride ? "override" : "missing"
          };
          report.push({ team: team.name, status: hasOverride ? "override" : "missing", size: "-" });
          continue;
        }

        const inputBuffer = await downloadBuffer(sourceUrl);
        metadata = await sharp(inputBuffer).metadata();
        const ext = safeExt(metadata.format);
        rawRelative = `assets/club-logos/raw/${key}.${ext}`;
        await fs.writeFile(path.join(ROOT, "public", rawRelative), inputBuffer);
      } catch (error) {
        clubs[key] = {
          ...previous,
          key,
          clubId: team.clubId,
          names: [...new Set([...(previous.names || []), team.name])],
          overrideAsset: hasOverride ? overrideRelative : previous.overrideAsset || null,
          asset: hasOverride ? overrideRelative : previous.rawFile || null,
          status: hasOverride ? "override" : "error",
          error: error.message
        };
        report.push({ team: team.name, status: hasOverride ? "override" : `ERROR: ${error.message}`, size: "-" });
        continue;
      }
    }

    if (!metadata && rawRelative) {
      try {
        metadata = await sharp(path.join(ROOT, "public", rawRelative)).metadata();
      } catch {
        metadata = null;
      }
    }

    const asset = hasOverride ? overrideRelative : rawRelative;

    clubs[key] = {
      ...previous,
      key,
      clubId: team.clubId,
      names: [...new Set([...(previous.names || []), team.name])],
      sourceUrl,
      rawFile: rawRelative,
      overrideAsset: hasOverride ? overrideRelative : null,
      asset,
      override: hasOverride,
      width: metadata?.width ?? previous.width ?? null,
      height: metadata?.height ?? previous.height ?? null,
      format: metadata?.format ?? previous.format ?? null,
      hasAlpha: Boolean(metadata?.hasAlpha),
      status: hasOverride ? "override" : "raw-fallback"
    };

    report.push({
      team: team.name,
      status: hasOverride ? "override" : "raw fallback",
      size: `${metadata?.width || "?"}x${metadata?.height || "?"}`
    });
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    strategy: "override-first-raw-fallback",
    note: "Override-PNG gewinnt immer. Fehlt ein Override, wird das unveraenderte handball.net Original aus raw verwendet.",
    clubs,
    teams: teamMap
  };

  await fs.writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.table(report);
  console.log(`\nManifest: ${MANIFEST_FILE}`);
  console.log(`Raw originals: ${RAW_DIR}`);
  console.log(`Overrides: ${OVERRIDE_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
