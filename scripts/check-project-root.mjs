/**
 * npm runs scripts with cwd = package root. If these files are missing, the shell is wrong
 * or the project tree is incomplete (common cause of "Could not resolve src/styles.scss").
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(pkgRoot);

const required = ["tsconfig.app.json", "src/main.ts", "src/styles.scss"];
let bad = false;
for (const rel of required) {
  const abs = path.join(pkgRoot, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[frontend-new] Expected file missing: ${rel}`);
    console.error(`[frontend-new] Working directory should be: ${pkgRoot}`);
    bad = true;
  }
}
if (bad) {
  console.error("[frontend-new] Fix: cd into the frontend-new folder, or restore deleted files from git.");
  process.exit(1);
}
