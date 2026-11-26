import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { isSignedIn, listPasskeys, rp, setupTokenMatches } from "@/lib/passkeys";
import { CHALLENGE_COOKIE, signChallenge } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!(await isSignedIn()) && !setupTokenMatches(body.setupToken)) {
    return NextResponse.json({ error: "Setup code is wrong or missing." }, { status: 403 });
  }

  const { rpID, rpName } = rp();
  const existing = await listPasskeys();
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: "owner",
    userDisplayName: "LifeOS owner",
    userID: new TextEncoder().encode("lifeos-owner"),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports ?? undefined })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });

  const res = NextResponse.json(options);
  res.cookies.set(CHALLENGE_COOKIE, await signChallenge(options.challenge, "register"), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/auth", maxAge: 300,
  });
  return res;
}
