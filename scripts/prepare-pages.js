import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const DIST_DIR = path.join(ROOT, "dist");
const MANIFEST_FILE = path.join(PUBLIC_DIR, "data", "club-logos.json");

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.cp(PUBLIC_DIR, DIST_DIR, { recursive: true });

  // Raw-Logos sind Arbeits-/Fallback-Assets. Im Pages-Artefakt brauchen wir
  // nur Raw-Dateien, die das Manifest tatsaechlich als aktives Fallback nutzt.
  const distRawDir = path.join(DIST_DIR, "assets", "club-logos", "raw");
  await fs.rm(distRawDir, { recursive: true, force: true });
  await fs.mkdir(distRawDir, { recursive: true });

  if (await exists(MANIFEST_FILE)) {
    const manifest = JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8"));
    const rawAssets = new Set(
      Object.values(manifest.clubs || {})
        .map((club) => club?.asset)
        .filter((asset) => typeof asset === "string" && asset.startsWith("assets/club-logos/raw/"))
    );

    for (const asset of rawAssets) {
      const source = path.join(PUBLIC_DIR, asset);
      const target = path.join(DIST_DIR, asset);
      if (!(await exists(source))) continue;
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(source, target);
    }
  }

  // Nur die zur Laufzeit benoetigte Schrift wird deployed.
  const distFonts = path.join(DIST_DIR, "assets", "fonts");
  if (await exists(distFonts)) {
    for (const name of await fs.readdir(distFonts)) {
      if (name === "BebasNeue-Bold.ttf") continue;
      await fs.rm(path.join(distFonts, name), { recursive: true, force: true });
    }
  }

  // Arbeits-/Dokumentationsdateien muessen nicht ins Pages-Artefakt.
  for (const relative of [
    "assets/README.txt",
    "assets/sghnms_images/README.txt",
    "assets/club-logos/README.md",
    "assets/club-logos/overrides/README.md",
    "assets/club-logos/overrides/LOGO_INDEX.csv"
  ]) {
    await fs.rm(path.join(DIST_DIR, relative), { force: true });
  }

  console.log(`Pages-Artefakt vorbereitet: ${DIST_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
