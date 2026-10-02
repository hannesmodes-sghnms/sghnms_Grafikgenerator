import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");

const source = path.join(
  ROOT,
  "node_modules",
  "html2canvas",
  "dist",
  "html2canvas.min.js"
);

const targetDir = path.join(ROOT, "public", "vendor", "html2canvas");
const target = path.join(targetDir, "html2canvas.min.js");

await fs.mkdir(targetDir, { recursive: true });
await fs.copyFile(source, target);
console.log(`html2canvas kopiert nach ${target}`);
