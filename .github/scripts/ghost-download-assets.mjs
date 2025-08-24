import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dateTag = process.env.BACKUP_DATE; // YYYY-MM-DD (IST)
const baseUrl = (process.env.GHOST_ADMIN_API_URL || "").replace(/\/+$/, "");
if (!dateTag) {
  console.error("Missing BACKUP_DATE");
  process.exit(1);
}

const dayDir = path.join(process.cwd(), "output", dateTag);
const jsonPath = path.join(dayDir, `ghost-export-${dateTag}.json`);
const assetsRoot = path.join(dayDir, "assets");

function* walk(o) {
  if (!o) return;
  if (typeof o === "string") {
    yield o;
  } else if (Array.isArray(o)) {
    for (const i of o) yield* walk(i);
  } else if (typeof o === "object") {
    for (const k of Object.keys(o)) yield* walk(o[k]);
  }
}

function normalizeToAbsolute(url) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return baseUrl + url;
  return null;
}

function extractImageUrls(jsonObj) {
  const urls = new Set();
  const localPrefix = "/content/images/";

  for (const s of walk(jsonObj)) {
    if (typeof s !== "string") continue;

    // quick path: direct /content/images/
    if (s.includes(localPrefix)) {
      // find all occurrences in the string (handles HTML blobs)
      const re = /(?:https?:\/\/[^"' )]+)?(\/content\/images\/[^"' )]+)/g;
      let m;
      while ((m = re.exec(s))) {
        const rel = m[1];
        const abs = (s.startsWith("http") ? s : baseUrl + rel);
        const finalUrl = normalizeToAbsolute(abs);
        if (finalUrl) urls.add(finalUrl);
      }
    }
  }
  return [...urls];
}

async function download(url, outFile) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, buf);
}

async function run() {
  if (!fs.existsSync(jsonPath)) {
    console.error(`Export JSON not found: ${jsonPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(jsonPath, "utf8");
  const json = JSON.parse(raw);

  const urls = extractImageUrls(json);
  console.log(`Found ${urls.length} local asset URL(s)`);

  // Save under output/YYYY-MM-DD/assets/<same relative path after /content/images/>
  // e.g. https://site/content/images/2025/08/img.png -> assets/2025/08/img.png
  let ok = 0, fail = 0;

  // Simple concurrency limiter
  const limit = 6;
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const idx = i++;
      const u = urls[idx];
      const relMatch = u.match(/\/content\/images\/(.+)$/);
      if (!relMatch) continue;
      const rel = relMatch[1];
      const outFile = path.join(assetsRoot, rel);
      if (fs.existsSync(outFile)) { ok++; continue; } // already fetched
      try {
        await download(u, outFile);
        console.log(`✓ ${u}`);
        ok++;
      } catch (e) {
        console.warn(`✗ ${u} (${e.message})`);
        fail++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, urls.length)) }, worker));

  console.log(`Assets done. Success: ${ok}, Failed: ${fail}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
