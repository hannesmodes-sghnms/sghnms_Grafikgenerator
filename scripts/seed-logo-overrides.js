import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");

const MANIFEST_FILE = path.join(ROOT, "public", "data", "club-logos.json");
const OVERRIDE_DIR = path.join(ROOT, "public", "assets", "club-logos", "overrides");
const INDEX_FILE = path.join(OVERRIDE_DIR, "LOGO_INDEX.csv");

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function csvCell(value = "") {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8"));
  await fs.mkdir(OVERRIDE_DIR, { recursive: true });

  const rows = [["key", "override_file", "team_names", "raw_file", "source_url"]];
  let created = 0;
  let existing = 0;

  for (const [key, club] of Object.entries(manifest.clubs || {})) {
    if (!club.rawFile) continue;

    const rawAbsolute = path.join(ROOT, "public", club.rawFile);
    if (!(await fileExists(rawAbsolute))) continue;

    const overrideRelative = `assets/club-logos/overrides/${key}.png`;
    const overrideAbsolute = path.join(ROOT, "public", overrideRelative);

    if (!(await fileExists(overrideAbsolute))) {
      // Nur Formatkonvertierung nach PNG. Keine Freistellung, keine Farbaenderung.
      await sharp(rawAbsolute).png().toFile(overrideAbsolute);
      created += 1;
    } else {
      existing += 1;
    }

    club.overrideAsset = overrideRelative;
    club.asset = overrideRelative;
    club.override = true;
    club.status = "override";

    rows.push([
      key,
      `${key}.png`,
      (club.names || []).join(" | "),
      club.rawFile,
      club.sourceUrl || ""
    ]);
  }

  manifest.generatedAt = new Date().toISOString();
  manifest.strategy = "override-first-raw-fallback";
  manifest.note = "Override-PNG gewinnt immer. Fehlt ein Override, wird das unveraenderte handball.net Original aus raw verwendet.";

  await fs.writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.writeFile(
    INDEX_FILE,
    `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
    "utf8"
  );

  console.log(`${created} Override-PNGs neu angelegt.`);
  console.log(`${existing} bestehende Override-PNGs unangetastet gelassen.`);
  console.log(`Ordner: ${OVERRIDE_DIR}`);
  console.log(`Index: ${INDEX_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
