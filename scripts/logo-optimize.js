import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const OVERRIDE_DIR = path.join(ROOT, "public", "assets", "club-logos", "overrides");
const MANIFEST_FILE = path.join(ROOT, "public", "data", "club-logos.json");

const TARGET_WIDTH = 860;
const TARGET_HEIGHT = 600;

async function loadManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8"));
  } catch {
    return null;
  }
}

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
  const names = (await fs.readdir(OVERRIDE_DIR))
    .filter((name) => name.toLowerCase().endsWith(".png"))
    .sort();

  if (!names.length) {
    throw new Error("Keine Override-PNGs gefunden.");
  }

  const manifest = await loadManifest();
  let beforeTotal = 0;
  let afterTotal = 0;
  const report = [];

  for (const name of names) {
    const filePath = path.join(OVERRIDE_DIR, name);
    const before = await fs.stat(filePath);
    const inputMeta = await sharp(filePath).metadata();

    const buffer = await sharp(filePath)
      .rotate()
      .resize({
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
        fit: "inside",
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos3
      })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: false
      })
      .toBuffer();

    await fs.writeFile(filePath, buffer);

    const outputMeta = await sharp(buffer).metadata();
    const after = buffer.length;
    beforeTotal += before.size;
    afterTotal += after;

    const key = path.basename(name, ".png");
    const club = manifest?.clubs?.[key];
    if (club) {
      club.width = outputMeta.width ?? club.width ?? null;
      club.height = outputMeta.height ?? club.height ?? null;
      club.format = "png";
      club.hasAlpha = Boolean(outputMeta.hasAlpha);
      club.override = true;
      club.status = "override";
    }

    report.push({
      logo: name,
      before: `${inputMeta.width || "?"}x${inputMeta.height || "?"}`,
      after: `${outputMeta.width || "?"}x${outputMeta.height || "?"}`,
      size: `${Math.round(before.size / 1024)} KB -> ${Math.round(after / 1024)} KB`
    });
  }

  if (manifest) {
    manifest.generatedAt = new Date().toISOString();
    await fs.writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  console.table(report);
  console.log(`\n${names.length} Override-Logos optimiert.`);
  console.log(`Vorher: ${formatMb(beforeTotal)}`);
  console.log(`Nachher: ${formatMb(afterTotal)}`);
  console.log(`Zielbox: ${TARGET_WIDTH}x${TARGET_HEIGHT}px, Seitenverhaeltnis bleibt erhalten.`);
  console.log("Hinweis: Die Override-Dateien werden in-place ersetzt. Hochaufloesende Master ggf. lokal behalten.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
