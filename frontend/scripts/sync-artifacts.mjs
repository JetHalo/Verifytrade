#!/usr/bin/env node
/**
 * Sync build artifacts from sibling packages into ./public and ./data so the
 * frontend can run without manual `cp` steps.
 *
 * Wired in package.json as `predev` and `prebuild` -- runs automatically.
 *
 * Maps:
 *   ../circuit/target/verifytrade_circuit.json   ->  ./public/verifytrade_circuit.json
 *   ../circuit/target/proof_out/vk               ->  ./data/vk
 *   ../plugin/dist/*.js                          ->  ./public/veirfytrade.plugin.js
 *
 * Each mapping is independent. If a source is missing, prints a yellow warning
 * with the command to produce it, then continues. (Frontend still starts so you
 * can browse the UI; the affected feature just won't work until the source is
 * present.)
 */
import { existsSync, mkdirSync, copyFileSync, statSync, readdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "..");
const REPO     = resolve(FRONTEND, "..");

const c = {
  reset: "\x1b[0m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m",
};
const log = (icon, color, msg) => console.log(`${color}${icon}${c.reset} ${msg}`);

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

/** Copy `src` -> `dst` only if src is newer than dst (or dst missing). */
function copyIfFresh(src, dst, label) {
  if (!existsSync(src)) {
    return { ok: false, reason: "missing" };
  }
  ensureDir(dirname(dst));
  if (existsSync(dst)) {
    const srcM = statSync(src).mtimeMs;
    const dstM = statSync(dst).mtimeMs;
    if (dstM >= srcM) {
      log("=", c.dim, `${label} unchanged ${c.dim}(${src} -> ${dst})${c.reset}`);
      return { ok: true, reason: "unchanged" };
    }
  }
  copyFileSync(src, dst);
  log("✓", c.green, `${label} ${c.dim}(${src} -> ${dst})${c.reset}`);
  return { ok: true, reason: "copied" };
}

function warn(label, missingPath, howToProduce) {
  log("!", c.yellow, `${label} -- source not found:`);
  log(" ", c.dim, `  expected: ${missingPath}`);
  log(" ", c.dim, `  produce:  ${howToProduce}`);
}

// -------- Mappings --------

let okCount = 0;
let warnCount = 0;
const tick = (r) => { if (r.ok) okCount++; else warnCount++; };

// 1. Circuit JSON -> public/
{
  const src = resolve(REPO, "circuit/target/verifytrade_circuit.json");
  const dst = resolve(FRONTEND, "public/verifytrade_circuit.json");
  const r = copyIfFresh(src, dst, "circuit JSON");
  if (!r.ok) warn("circuit JSON", src, "cd ../circuit && nargo compile");
  tick(r);
}

// 2. Verification key -> data/
{
  const src = resolve(REPO, "circuit/target/proof_out/vk");
  const dst = resolve(FRONTEND, "data/vk");
  const r = copyIfFresh(src, dst, "verification key");
  if (!r.ok) {
    warn(
      "verification key",
      src,
      "cd ../circuit && bb write_vk --scheme ultra_honk -b ./target/verifytrade_circuit.json -o ./target/proof_out",
    );
  }
  tick(r);
}

// 3. TLSNotary plugin bundle -> public/
{
  const pluginDist = resolve(REPO, "plugin/dist");
  const dst = resolve(FRONTEND, "public/veirfytrade.plugin.js");
  if (!existsSync(pluginDist)) {
    warn("plugin bundle", pluginDist, "cd ../plugin && pnpm install && pnpm build");
    warnCount++;
  } else {
    // Pick the first .js file in the dist dir
    const jsFiles = readdirSync(pluginDist).filter((f) => f.endsWith(".js"));
    if (jsFiles.length === 0) {
      warn("plugin bundle", pluginDist + "/*.js", "cd ../plugin && pnpm build");
      warnCount++;
    } else {
      // Prefer a file that contains "plugin" in its name; else first .js
      const main = jsFiles.find((f) => /plugin/i.test(f)) ?? jsFiles[0];
      const src = join(pluginDist, main);
      tick(copyIfFresh(src, dst, "plugin bundle"));
    }
  }
}

// -------- Summary --------

console.log();
if (warnCount === 0) {
  log("ok", c.cyan, `all artifacts present (${okCount} files)`);
} else {
  log("ok", c.cyan, `${okCount} synced, ${warnCount} missing -- frontend will still start, but those features will error until you run the suggested commands above.`);
}
