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
const PROCESSED_DIR = path.join(LOGO_ROOT, "processed");
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

  if (!candidates.length) return null;

  return htmlDecode(candidates[0]);
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

function isExteriorCandidate(r, g, b) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  const chroma = max - min;

  // Absichtlich relativ tolerant: viele Vereinslogos liegen auf weißem oder
  // hellgrauem JPG-Hintergrund. Entfernt werden trotzdem nur Pixel, die vom
  // Bildrand aus zusammenhängend erreichbar sind.
  return min >= 185 && chroma <= 30;
}

async function removeExteriorBackground(inputBuffer, outputFile) {
  const image = sharp(inputBuffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const enqueueIfBackground = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel]) return;

    const offset = pixel * channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];

    if (a === 0 || isExteriorCandidate(r, g, b)) {
      visited[pixel] = 1;
      queue[tail++] = pixel;
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueueIfBackground(x, 0);
    enqueueIfBackground(x, height - 1);
  }

  for (let y = 1; y < height - 1; y += 1) {
    enqueueIfBackground(0, y);
    enqueueIfBackground(width - 1, y);
  }

  let removedPixels = 0;

  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const offset = pixel * channels;

    if (data[offset + 3] !== 0) {
      data[offset + 3] = 0;
      removedPixels += 1;
    }

    enqueueIfBackground(x - 1, y);
    enqueueIfBackground(x + 1, y);
    enqueueIfBackground(x, y - 1);
    enqueueIfBackground(x, y + 1);
  }

  await sharp(data, {
    raw: {
      width,
      height,
      channels
    }
  }).png().toFile(outputFile);

  return {
    width,
    height,
    removedPixels,
    removedRatio: pixelCount ? removedPixels / pixelCount : 0
  };
}

async function loadJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const matchesPayload = await loadJson(MATCHES_FILE, null);

  if (!matchesPayload?.matches?.length) {
    throw new Error(
      "Keine Spieldaten gefunden. Erst `npm run update:data` ausführen."
    );
  }

  await fs.mkdir(RAW_DIR, { recursive: true });
  await fs.mkdir(PROCESSED_DIR, { recursive: true });
  await fs.mkdir(OVERRIDE_DIR, { recursive: true });

  const existingManifest = await loadJson(MANIFEST_FILE, {
    generatedAt: null,
    clubs: {},
    teams: {}
  });

  const teams = new Map();

  for (const match of matchesPayload.matches) {
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

  const clubs = { ...(existingManifest.clubs || {}) };
  const teamMap = { ...(existingManifest.teams || {}) };
  const report = [];

  for (const team of teams.values()) {
    const key = normalizeKey(team);
    teamMap[String(team.id)] = key;

    const overrideRelative = `assets/club-logos/overrides/${key}.png`;
    const overrideAbsolute = path.join(ROOT, "public", overrideRelative);

    if (await fileExists(overrideAbsolute)) {
      const metadata = await sharp(overrideAbsolute).metadata();
      clubs[key] = {
        ...(clubs[key] || {}),
        key,
        clubId: team.clubId,
        names: [...new Set([...(clubs[key]?.names || []), team.name])],
        asset: overrideRelative,
        override: true,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        format: metadata.format ?? "png",
        hasAlpha: Boolean(metadata.hasAlpha),
        status: "override"
      };

      report.push({ team: team.name, status: "override", size: `${metadata.width}x${metadata.height}` });
      continue;
    }

    const processedRelative = `assets/club-logos/processed/${key}.png`;
    const processedAbsolute = path.join(ROOT, "public", processedRelative);

    if (!FORCE && clubs[key]?.asset && await fileExists(processedAbsolute)) {
      report.push({
        team: team.name,
        status: "cached",
        size: `${clubs[key].width || "?"}x${clubs[key].height || "?"}`
      });
      continue;
    }

    try {
      const sourceUrl = await findLogoUrl(team.id);

      if (!sourceUrl) {
        clubs[key] = {
          ...(clubs[key] || {}),
          key,
          clubId: team.clubId,
          names: [...new Set([...(clubs[key]?.names || []), team.name])],
          asset: null,
          sourceUrl: null,
          status: "missing"
        };
        report.push({ team: team.name, status: "missing", size: "-" });
        continue;
      }

      const inputBuffer = await downloadBuffer(sourceUrl);
      const metadata = await sharp(inputBuffer).metadata();
      const ext = safeExt(metadata.format);
      const rawRelative = `assets/club-logos/raw/${key}.${ext}`;
      const rawAbsolute = path.join(ROOT, "public", rawRelative);

      await fs.writeFile(rawAbsolute, inputBuffer);

      const processed = await removeExteriorBackground(inputBuffer, processedAbsolute);
      const small = (metadata.width ?? 0) < 500 || (metadata.height ?? 0) < 500;

      clubs[key] = {
        key,
        clubId: team.clubId,
        names: [...new Set([...(clubs[key]?.names || []), team.name])],
        sourceUrl,
        rawFile: rawRelative,
        asset: processedRelative,
        override: false,
        width: metadata.width ?? processed.width,
        height: metadata.height ?? processed.height,
        format: metadata.format ?? null,
        hasAlpha: Boolean(metadata.hasAlpha),
        backgroundRemoved: processed.removedPixels > 0,
        removedRatio: Number(processed.removedRatio.toFixed(4)),
        quality: small ? "check-resolution" : "ok",
        status: "processed"
      };

      report.push({
        team: team.name,
        status: small ? "processed / LOW RES" : "processed",
        size: `${metadata.width || "?"}x${metadata.height || "?"}`
      });
    } catch (error) {
      clubs[key] = {
        ...(clubs[key] || {}),
        key,
        clubId: team.clubId,
        names: [...new Set([...(clubs[key]?.names || []), team.name])],
        asset: clubs[key]?.asset || null,
        status: "error",
        error: error.message
      };
      report.push({ team: team.name, status: `ERROR: ${error.message}`, size: "-" });
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    note: "Logo-Audit wird bewusst manuell ausgeführt und ist nicht Teil des regelmäßigen Pages-Workflows.",
    clubs,
    teams: teamMap
  };

  await fs.writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.table(report);
  console.log(`\nManifest: ${MANIFEST_FILE}`);
  console.log(`Processed: ${PROCESSED_DIR}`);
  console.log(`Overrides: ${OVERRIDE_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
