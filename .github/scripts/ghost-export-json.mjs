import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseUrl = process.env.GHOST_ADMIN_API_URL;   // e.g. https://blog.example.com
const adminKey = process.env.GHOST_ADMIN_API_KEY;  // id:secret
const dateTag = process.env.BACKUP_DATE;           // YYYY-MM-DD (IST) from prepare job

if (!baseUrl || !adminKey || !dateTag) {
  console.error("Missing GHOST_ADMIN_API_URL, GHOST_ADMIN_API_KEY, or BACKUP_DATE");
  process.exit(1);
}

const [id, secret] = adminKey.split(":") ?? [];
const token = jwt.sign({ aud: "/admin/" }, Buffer.from(secret, "hex"), {
  keyid: id, algorithm: "HS256", expiresIn: "5m"
});

const adminBase = baseUrl.replace(/\/+$/, "") + "/ghost/api/admin";
const outDir = path.join(process.cwd(), "output", dateTag);
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const res = await fetch(`${adminBase}/db/`, { headers: { Authorization: `Ghost ${token}` } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`DB export failed (${res.status}): ${txt.slice(0, 500)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const file = path.join(outDir, `ghost-export-${dateTag}.json`);
  fs.writeFileSync(file, buf);
  console.log(`Saved ${file}`);
})();
