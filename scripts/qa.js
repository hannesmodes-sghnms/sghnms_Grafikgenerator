import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CLUB_ID, TEAM_LABELS } from "../public/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const deployMode = process.argv.includes("--deploy");

const errors = [];
const warnings = [];

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function error(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function checkSyntax(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  const result = spawnSync(process.execPath, ["--check", absolute], { encoding: "utf8" });
  if (result.status !== 0) {
    error(`${relativePath}: JavaScript-Syntaxfehler: ${result.stderr.trim()}`);
  }
}

async function main() {
  const requiredFiles = [
    "public/index.html",
    "public/app.js",
    "public/match-utils.js",
    "public/single-match.js",
    "public/slide-base.css",
    "public/slide.css",
    "public/single-slide.css",
    "public/assets/fonts/BebasNeue-Bold.ttf",
    "public/assets/sghnms_images/sghnms_bg.png",
    "public/assets/canva/slide-bg.png",
    "public/assets/headlines/headline-home.svg",
    "public/assets/headlines/headline-away.svg",
    "public/assets/headlines/headline-results.svg",
    "public/assets/headlines/heimspiel.png",
    "public/assets/headlines/auswaerts.png",
    "public/assets/headlines/ergebnis.png"
  ];

  for (const relativePath of requiredFiles) {
    if (!(await exists(path.join(ROOT, relativePath)))) {
      error(`Pflichtdatei fehlt: ${relativePath}`);
    }
  }

  ["public/app.js", "public/match-utils.js", "public/single-match.js", "scripts/update-matches.js"].forEach(checkSyntax);

  const matchesPath = path.join(PUBLIC, "data", "matches.json");
  if (!(await exists(matchesPath))) {
    error("public/data/matches.json fehlt.");
  } else {
    const payload = await readJson(matchesPath);
    if (!Array.isArray(payload.matches)) {
      error("matches.json enthaelt kein matches-Array.");
    } else if (!payload.matches.length) {
      const message = "matches.json enthaelt keine Spiele. Vor QA `npm run update:data` ausfuehren.";
      if (deployMode) error(message);
      else warn(message);
    } else {
      const unmapped = new Map();
      for (const match of payload.matches) {
        for (const team of [match.home, match.away]) {
          if (String(team?.clubId ?? "") !== String(CLUB_ID)) continue;
          const teamId = String(team?.id ?? "");
          if (!TEAM_LABELS[teamId]) {
            unmapped.set(teamId || "ohne-id", team?.name || "Unbekanntes SG-Team");
          }
        }
      }

      for (const [teamId, name] of unmapped) {
        error(`SG-Team fehlt in TEAM_LABELS: ${name} (${teamId})`);
      }

      const manifestPath = path.join(PUBLIC, "data", "club-logos.json");
      if (!(await exists(manifestPath))) {
        warn("club-logos.json fehlt; Einzelspiel-Logos fallen auf Platzhalter zurueck.");
      } else {
        const manifest = await readJson(manifestPath);
        const missingLogoKeys = new Map();

        for (const match of payload.matches) {
          for (const team of [match.home, match.away]) {
            if (!team?.id) continue;
            const teamId = String(team.id);
            const key = manifest.teams?.[teamId] ?? String(team.clubId ?? `team-${teamId}`);
            const club = manifest.clubs?.[key];
            const asset = club?.asset;

            if (!asset) {
              missingLogoKeys.set(key, team.name || teamId);
              continue;
            }

            if (!(await exists(path.join(PUBLIC, asset)))) {
              error(`Logo-Manifest verweist auf fehlende Datei: ${asset}`);
            }
          }
        }

        for (const [key, name] of missingLogoKeys) {
          warn(`Kein Logo-Asset fuer ${name} (${key}); Platzhalter wird verwendet.`);
        }
      }
    }
  }

  console.log("\nSGHNMS QA");
  console.log("=========");

  if (warnings.length) {
    console.log(`\nWarnungen (${warnings.length}):`);
    warnings.forEach((message) => console.log(`- ${message}`));
  }

  if (errors.length) {
    console.error(`\nFehler (${errors.length}):`);
    errors.forEach((message) => console.error(`- ${message}`));
    process.exitCode = 1;
    return;
  }

  console.log(`\nOK${warnings.length ? " (mit Warnungen)" : ""}.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
