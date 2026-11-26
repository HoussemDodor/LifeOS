import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./supabase";

const TTL_MIN = 15;
const MAX_PER_HOUR = 3;

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * Recovery sign-in. The link always goes to OWNER_EMAIL, never to an address
 * typed on the login page, and only the token's hash is stored.
 */
export async function sendMagicLink(): Promise<"sent" | "rate-limited" | "not-configured"> {
  const to = process.env.OWNER_EMAIL;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!to || !key || !from) return "not-configured";

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db().from("magic_links").select("*", { count: "exact", head: true }).gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_HOUR) return "rate-limited";

  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + TTL_MIN * 60 * 1000).toISOString();
  const { error } = await db().from("magic_links").insert({ token_hash: hash(token), expires_at: expires });
  if (error) throw error;

  // The link opens a confirm page; the sign-in itself is a POST, so mail
  // scanners that pre-open links (Outlook Safe Links) can't use up the token.
  const link = `${process.env.APP_ORIGIN}/login/magic?token=${token}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: "Your LifeOS sign-in link",
      text: `Sign in to LifeOS: ${link}\n\nThe link works once and expires in ${TTL_MIN} minutes. If you didn't ask for it, ignore this email and add a new passkey soon.`,
    }),
  });
  if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
  return "sent";
}

/** Marks the token used and returns true if it was valid, unused and unexpired. */
export async function consumeMagicLink(token: string): Promise<boolean> {
  if (!token || token.length > 100) return false;
  const { data, error } = await db()
    .from("magic_links")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hash(token))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("token_hash");
  if (error) throw error;
  return (data?.length ?? 0) === 1;
}
