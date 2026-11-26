// Sends the secret values from .env.production.local to Vercel (production).
// Run it yourself:  node scripts/push-secrets.mjs [NAME ...]
// With names, only those are sent (e.g. `node scripts/push-secrets.mjs RESEND_API_KEY`).
// It prints only the names, never the values.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ALL = ["SESSION_SECRET", "SETUP_TOKEN", "SUPABASE_SERVICE_ROLE_KEY", "NOTION_TOKEN", "RESEND_API_KEY"];
const SECRETS = process.argv.length > 2 ? process.argv.slice(2).filter((n) => ALL.includes(n)) : ALL;
const env = Object.fromEntries(
  readFileSync(".env.production.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
let missing = 0;
for (const name of SECRETS) {
  const value = env[name];
  if (!value) {
    console.log(`SKIPPED ${name}: empty in .env.production.local`);
    missing++;
    continue;
  }
  // Remove an older value first so re-running the script replaces it.
  spawnSync(npx, ["--yes", "vercel@48.1.6", "env", "rm", name, "production", "--yes"], { stdio: "ignore", shell: true });
  const r = spawnSync(npx, ["--yes", "vercel@48.1.6", "env", "add", name, "production"], { input: value, stdio: ["pipe", "ignore", "ignore"], shell: true });
  console.log(r.status === 0 ? `added ${name}` : `FAILED ${name}`);
}
console.log(missing ? `\n${missing} value(s) still empty. Fill them in and run again.` : "\nAll secrets sent to Vercel.");
