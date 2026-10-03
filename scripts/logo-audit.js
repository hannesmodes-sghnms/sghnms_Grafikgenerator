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

const PROCESSOR_VERSION = 2;
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

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function chroma(r, g, b) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function brightness(r, g, b) {
  return (r + g + b) / 3;
}

function estimateBorderBackground(data, width, height, channels) {
  const samples = [];
  const stepX = Math.max(1, Math.floor(width / 80));
  const stepY = Math.max(1, Math.floor(height / 80));

  const add = (x, y) => {
    const offset = (y * width + x) * channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];

    if (a > 20 && chroma(r, g, b) <= 45) {
      samples.push([r, g, b]);
    }
  };

  for (let x = 0; x < width; x += stepX) {
    add(x, 0);
    add(x, height - 1);
  }

  for (let y = 0; y < height; y += stepY) {
    add(0, y);
    add(width - 1, y);
  }

  if (!samples.length) return null;

  // Quantisieren, damit JPG-Rauschen nicht jeden Hintergrundpixel in einen
  // eigenen Farbwert zerlegt.
  const buckets = new Map();

  for (const [r, g, b] of samples) {
    const key = [r, g, b]
      .map((value) => Math.round(value / 12) * 12)
      .join(",");
    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return null;

  return [
    dominant.r / dominant.count,
    dominant.g / dominant.count,
    dominant.b / dominant.count
  ];
}

function isExteriorCandidate(r, g, b, borderColor) {
  if (!borderColor) {
    return Math.min(r, g, b) >= 185 && chroma(r, g, b) <= 30;
  }

  return colorDistance([r, g, b], borderColor) <= 48 && chroma(r, g, b) <= 55;
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

  const borderColor = estimateBorderBackground(data, width, height, channels);
  const borderBrightness = borderColor
    ? brightness(borderColor[0], borderColor[1], borderColor[2])
    : 255;

  const enqueueIfBackground = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel]) return;

    const offset = pixel * channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];

    if (a === 0 || isExteriorCandidate(r, g, b, borderColor)) {
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

  /*
   * Sonderfall wie Bramstedter TS:
   * farbige Diagonalstreifen beruehren den Bildrand und teilen den grauen
   * Hintergrund in voneinander getrennte Flaechen. Flood-Fill alleine kann
   * diese eingeschlossenen grauen Flaechen nicht erreichen.
   *
   * Wenn der dominante Rand-Hintergrund deutlich grau (nicht nahezu weiss)
   * ist, entfernen wir deshalb zusaetzlich alle Pixel, die farblich sehr nah
   * am erkannten Rand-Hintergrund liegen. Weisse Logo-Bestandteile bleiben
   * dabei erhalten, weil sie deutlich heller als der graue Hintergrund sind.
   * Bei fast weissem Hintergrund wird dieser globale Schritt bewusst NICHT
   * ausgefuehrt, damit weisse Innenflaechen eines Logos nicht verschwinden.
   */
  let globallyRemovedPixels = 0;

  if (borderColor && borderBrightness < 238) {
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const offset = pixel * channels;
      const a = data[offset + 3];
      if (a === 0) continue;

      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const distance = colorDistance([r, g, b], borderColor);

      if (distance <= 34 && chroma(r, g, b) <= 50) {
        data[offset + 3] = 0;
        globallyRemovedPixels += 1;
      }
    }
  }

  await sharp(data, {
    raw: {
      width,
      height,
      channels
    }
  }).png().toFile(outputFile);

  const totalRemovedPixels = removedPixels + globallyRemovedPixels;

  return {
    width,
    height,
    borderColor: borderColor
      ? borderColor.map((value) => Math.round(value))
      : null,
    borderBrightness: Number(borderBrightness.toFixed(1)),
    removedPixels: totalRemovedPixels,
    connectedRemovedPixels: removedPixels,
    globallyRemovedPixels,
    removedRatio: pixelCount ? totalRemovedPixels / pixelCount : 0
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
      "Keine Spieldaten gefunden. Erst `npm run update:data` ausfuehren."
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
        processorVersion: PROCESSOR_VERSION,
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

    const cacheIsCurrent =
      clubs[key]?.processorVersion === PROCESSOR_VERSION &&
      clubs[key]?.asset &&
      await fileExists(processedAbsolute);

    if (!FORCE && cacheIsCurrent) {
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
          processorVersion: PROCESSOR_VERSION,
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
        processorVersion: PROCESSOR_VERSION,
        width: metadata.width ?? processed.width,
        height: metadata.height ?? processed.height,
        format: metadata.format ?? null,
        hasAlpha: Boolean(metadata.hasAlpha),
        backgroundRemoved: processed.removedPixels > 0,
        backgroundColor: processed.borderColor,
        backgroundBrightness: processed.borderBrightness,
        connectedRemovedPixels: processed.connectedRemovedPixels,
        globallyRemovedPixels: processed.globallyRemovedPixels,
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
        processorVersion: PROCESSOR_VERSION,
        status: "error",
        error: error.message
      };
      report.push({ team: team.name, status: `ERROR: ${error.message}`, size: "-" });
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    processorVersion: PROCESSOR_VERSION,
    note: "Logo-Audit wird bewusst manuell ausgefuehrt und ist nicht Teil des regelmaessigen Pages-Workflows.",
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
