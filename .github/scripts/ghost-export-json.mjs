import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseUrl = process.env.GHOST_ADMIN_API_URL;   // e.g. https://blog.example.com
const username = process.env.GHOST_USERNAME;       // admin username
const password = process.env.GHOST_PASSWORD;       // admin password
const dateTag = process.env.BACKUP_DATE;           // YYYY-MM-DD (IST) from prepare job

if (!baseUrl || !username || !password || !dateTag) {
  console.error("Missing GHOST_ADMIN_API_URL, GHOST_USERNAME, GHOST_PASSWORD, or BACKUP_DATE");
  process.exit(1);
}

const adminBase = baseUrl.replace(/\/+$/, "") + "/ghost/api/admin";
const outDir = path.join(process.cwd(), "output", dateTag);
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  // First, authenticate with username/password to get session
  const authRes = await fetch(`${adminBase}/auth/session/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: username,
      password: password
    })
  });

  if (!authRes.ok) {
    const txt = await authRes.text().catch(() => "");
    throw new Error(`Authentication failed (${authRes.status}): ${txt.slice(0, 500)}`);
  }

  const authData = await authRes.json();
  const sessionToken = authData.data.session_id;

  if (!sessionToken) {
    throw new Error("No session token received from authentication");
  }

  // Now use the session token to export the database
  const res = await fetch(`${adminBase}/db/`, { 
    headers: { 
      'Cookie': `ghost-admin-api-session=${sessionToken}` 
    } 
  });
  
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`DB export failed (${res.status}): ${txt.slice(0, 500)}`);
  }
  
  const buf = Buffer.from(await res.arrayBuffer());
  const file = path.join(outDir, `ghost-export-${dateTag}.json`);
  fs.writeFileSync(file, buf);
  console.log(`Saved ${file}`);
})();
