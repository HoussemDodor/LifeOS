import { NextResponse } from "next/server";
import { consumeMagicLink, sendMagicLink } from "@/lib/magic-link";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

/** JSON body {} → email a link. Form body with `token` → sign in with it. */
export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";

  if (type.includes("application/x-www-form-urlencoded")) {
    const token = String((await req.formData()).get("token") ?? "");
    if (!(await consumeMagicLink(token))) {
      return NextResponse.redirect(new URL("/login?error=link", req.url), 303);
    }
    const res = NextResponse.redirect(new URL("/", req.url), 303);
    res.cookies.set(SESSION_COOKIE, await createSessionToken("magic-link"), sessionCookieOptions);
    return res;
  }

  const result = await sendMagicLink();
  if (result === "not-configured") {
    return NextResponse.json({ error: "Email recovery isn't set up yet." }, { status: 503 });
  }
  if (result === "rate-limited") {
    return NextResponse.json({ error: "Too many links requested. Try again in an hour." }, { status: 429 });
  }
  return NextResponse.json({ ok: true });
}
