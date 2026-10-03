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

const PROCESSOR_VERSION = 5;
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

function chroma(r, g, b) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function brightness(r, g, b) {
  return (r + g + b) / 3;
}

function isNearWhite(r, g, b) {
  const min = Math.min(r, g, b);

  /*
   * Nur fast weisse / sehr helle neutrale Pixel sind Background-Kandidaten.
   * Graue Logo-Flaechen wie beim Bramstedter TS bleiben damit Vordergrund.
   * Die Toleranz ist trotzdem gross genug fuer JPG-Rauschen an einem weissen
   * Hintergrund.
   */
  return min >= 205 && chroma(r, g, b) <= 48 && brightness(r, g, b) >= 218;
}

function buildWhiteCandidateMask(data, width, height, channels) {
  const pixelCount = width * height;
  const mask = new Uint8Array(pixelCount);

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * channels;
    const a = data[offset + 3];

    if (a === 0) {
      mask[pixel] = 1;
      continue;
    }

    mask[pixel] = isNearWhite(
      data[offset],
      data[offset + 1],
      data[offset + 2]
    ) ? 1 : 0;
  }

  return mask;
}

function buildIntegral(mask, width, height) {
  const stride = width + 1;
  const integral = new Uint32Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    const sourceRow = y * width;
    const integralRow = (y + 1) * stride;
    const previousRow = y * stride;

    for (let x = 0; x < width; x += 1) {
      rowSum += mask[sourceRow + x];
      integral[integralRow + x + 1] = integral[previousRow + x + 1] + rowSum;
    }
  }

  return integral;
}

function rectSum(integral, width, x1, y1, x2, y2) {
  const stride = width + 1;

  return (
    integral[(y2 + 1) * stride + (x2 + 1)] -
    integral[y1 * stride + (x2 + 1)] -
    integral[(y2 + 1) * stride + x1] +
    integral[y1 * stride + x1]
  );
}

function erodeBinary(mask, width, height, radius) {
  if (radius <= 0) return new Uint8Array(mask);

  const integral = buildIntegral(mask, width, height);
  const output = new Uint8Array(mask.length);
  const diameter = radius * 2 + 1;
  const fullArea = diameter * diameter;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const x1 = Math.max(0, x - radius);
      const y1 = Math.max(0, y - radius);
      const x2 = Math.min(width - 1, x + radius);
      const y2 = Math.min(height - 1, y + radius);

      const insideArea = (x2 - x1 + 1) * (y2 - y1 + 1);
      const outsideArea = fullArea - insideArea;
      const insideSum = rectSum(integral, width, x1, y1, x2, y2);

      // Ausserhalb des Bildes behandeln wir als weissen Aussenraum. Dadurch
      // bleibt der echte weisse Bildrand als Seed fuer das Flood-Fill erhalten.
      if (insideSum + outsideArea === fullArea) {
        output[y * width + x] = 1;
      }
    }
  }

  return output;
}

function dilateBinary(mask, width, height, radius) {
  if (radius <= 0) return new Uint8Array(mask);

  const integral = buildIntegral(mask, width, height);
  const output = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const x1 = Math.max(0, x - radius);
      const y1 = Math.max(0, y - radius);
      const x2 = Math.min(width - 1, x + radius);
      const y2 = Math.min(height - 1, y + radius);

      if (rectSum(integral, width, x1, y1, x2, y2) > 0) {
        output[y * width + x] = 1;
      }
    }
  }

  return output;
}

function floodFillFromBorder(mask, width, height) {
  const pixelCount = width * height;
  const exterior = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;

    const pixel = y * width + x;
    if (!mask[pixel] || exterior[pixel]) return;

    exterior[pixel] = 1;
    queue[tail++] = pixel;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }

  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);

    // 4er-Nachbarschaft: diagonale Einzelpixel sollen keine Verbindung
    // zwischen Aussenraum und weissen Logo-Details herstellen.
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  return exterior;
}

function buildExteriorRemovalMask(candidateMask, width, height, sealRadius) {
  /*
   * v5: Wir schliessen NICHT mehr die Vordergrund-Silhouette. Genau dieser
   * Schritt aus v4 hat in hellen / komprimierten Bildbereichen grosse Teile
   * des Aussenhintergrunds als "geschuetzt" markiert und damit die sichtbaren
   * rechteckigen Streifenartefakte erzeugt.
   *
   * Stattdessen oeffnen wir ausschliesslich die weisse Background-Maske:
   *
   *   1. Background erodieren -> schmale weisse Verbindungen brechen ab.
   *   2. Nur den erodierten Background vom Bildrand aus flood-fillen.
   *   3. Diese echte Aussenflaeche wieder um denselben Radius dilatieren.
   *   4. Mit der ORIGINALEN weissen Kandidatenmaske schneiden.
   *
   * Damit wird beim Bramstedter Logo die schmale Verbindung oben rechts
   * gekappt, die breite weisse Diagonale selbst bleibt aber erhalten.
   */
  const exteriorCoreCandidates = erodeBinary(
    candidateMask,
    width,
    height,
    sealRadius
  );

  const exteriorCore = floodFillFromBorder(
    exteriorCoreCandidates,
    width,
    height
  );

  const restoredExterior = dilateBinary(
    exteriorCore,
    width,
    height,
    sealRadius
  );

  const removalMask = new Uint8Array(candidateMask.length);

  for (let pixel = 0; pixel < candidateMask.length; pixel += 1) {
    removalMask[pixel] = candidateMask[pixel] && restoredExterior[pixel] ? 1 : 0;
  }

  return removalMask;
}

async function removeExteriorBackground(inputBuffer, outputFile) {
  const image = sharp(inputBuffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const pixelCount = width * height;

  const candidateMask = buildWhiteCandidateMask(
    data,
    width,
    height,
    channels
  );

  const sealRadius = Math.max(
    2,
    Math.min(14, Math.round(Math.min(width, height) * 0.01))
  );

  const removalMask = buildExteriorRemovalMask(
    candidateMask,
    width,
    height,
    sealRadius
  );

  let removedPixels = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (!removalMask[pixel]) continue;

    const offset = pixel * channels;

    if (data[offset + 3] !== 0) {
      removedPixels += 1;
    }

    /*
     * Hart transparent + RGB neutralisieren. So koennen weder Browser noch
     * html2canvas Farbinformationen aus transparenten Pixeln als Halo /
     * Streifen an Kanten sichtbar machen.
     */
    data[offset] = 0;
    data[offset + 1] = 0;
    data[offset + 2] = 0;
    data[offset + 3] = 0;
  }

  await sharp(data, {
    raw: {
      width,
      height,
      channels
    }
  })
    .png({
      palette: false,
      compressionLevel: 9
    })
    .toFile(outputFile);

  return {
    width,
    height,
    removedPixels,
    connectedRemovedPixels: removedPixels,
    globallyRemovedPixels: 0,
    componentRemovedPixels: 0,
    removedRatio: pixelCount ? removedPixels / pixelCount : 0,
    backgroundStrategy: "near-white-background-opening-v5",
    sealRadius
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

      report.push({
        team: team.name,
        status: "override",
        size: `${metadata.width}x${metadata.height}`
      });
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

      const processed = await removeExteriorBackground(
        inputBuffer,
        processedAbsolute
      );
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
        backgroundStrategy: processed.backgroundStrategy,
        sealRadius: processed.sealRadius,
        connectedRemovedPixels: processed.connectedRemovedPixels,
        globallyRemovedPixels: 0,
        componentRemovedPixels: 0,
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
      report.push({
        team: team.name,
        status: `ERROR: ${error.message}`,
        size: "-"
      });
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    processorVersion: PROCESSOR_VERSION,
    note: "Logo-Audit wird bewusst manuell ausgefuehrt und ist nicht Teil des regelmaessigen Pages-Workflows.",
    clubs,
    teams: teamMap
  };

  await fs.writeFile(
    MANIFEST_FILE,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  console.table(report);
  console.log(`\nManifest: ${MANIFEST_FILE}`);
  console.log(`Processed: ${PROCESSED_DIR}`);
  console.log(`Overrides: ${OVERRIDE_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
