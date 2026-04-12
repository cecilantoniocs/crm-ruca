#!/usr/bin/env node
/* eslint-disable */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}
function rel(p) { return p.replace(PUBLIC, "").replace(/\\/g, "/"); }

function readIf(p) { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } }

const srcFiles = [
  ...["pages","src","components","lib","app"].flatMap(d => {
    const p = path.join(ROOT, d);
    return fs.existsSync(p) ? walk(p) : [];
  }),
  path.join(PUBLIC, "manifest.webmanifest"),
  path.join(PUBLIC, "site.webmanifest"),
  path.join(ROOT, "next.config.js"),
  path.join(ROOT, "next.config.mjs"),
  path.join(ROOT, "package.json"),
  path.join(PUBLIC, "_headers"),
  path.join(PUBLIC, "_redirects"),
].filter(fs.existsSync);

const code = srcFiles.map(readIf).join("\n");
const allAssets = walk(PUBLIC).filter(p => !p.includes("/.trash/"));
const relAssets = allAssets.map(rel);

const used = new Set();
for (const asset of relAssets) {
  const esc = asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const byPath = new RegExp(esc, "i").test(code);
  const byBase = new RegExp(`['"\`/]${path.basename(asset)}['"\`]`, "i").test(code);
  if (byPath || byBase) used.add(asset);
}

const unused = relAssets.filter(a => !used.has(a));
const showUsed = process.argv.includes("--show-used");
const doTrash = process.argv.includes("--trash");

console.log(`📦 Assets en /public: ${relAssets.length}`);
console.log(`✅ Usados (detectados): ${used.size}`);
if (showUsed && used.size) {
  console.log("\nUsados:");
  [...used].sort().forEach(u => console.log("  - " + u));
}
console.log(`🗃️  No usados (seguros): ${unused.length}\n`);

if (unused.length) {
  console.log("No usados:");
  unused.sort().forEach(u => console.log("  - " + u));
}

if (doTrash && unused.length) {
  const trashDir = path.join(PUBLIC, ".trash");
  if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });
  for (const u of unused) {
    const from = path.join(PUBLIC, u);
    const to = path.join(trashDir, path.basename(u));
    try {
      fs.renameSync(from, to);
      console.log("➡️  movido a .trash:", u);
    } catch (e) {
      console.warn("⚠️ no se pudo mover", u, e.message);
    }
  }
  console.log("\nListo. Revisa la app. Si todo ok, elimina /public/.trash/");
} else {
  console.log("\nSugerencia: ejecuta con --trash para mover los no usados a /public/.trash/");
}
