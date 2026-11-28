import { NextResponse, type NextRequest } from "next/server";
import { devBypassEnabled, SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const PUBLIC = ["/login", "/api/auth/"];
// Home-screen app files: iOS fetches these without the session cookie. Exact paths only.
const PUBLIC_EXACT = ["/manifest.webmanifest", "/apple-icon", "/app-icon/192", "/app-icon/512", "/app-icon/maskable-512"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();
  if (PUBLIC_EXACT.includes(pathname)) return NextResponse.next();
  if (devBypassEnabled()) return NextResponse.next();

  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
