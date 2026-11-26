import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { rp } from "@/lib/passkeys";
import { CHALLENGE_COOKIE, signChallenge } from "@/lib/session";

export async function POST() {
  // Discoverable credentials: the browser offers whichever LifeOS passkey you have.
  const options = await generateAuthenticationOptions({ rpID: rp().rpID, userVerification: "required" });
  const res = NextResponse.json(options);
  res.cookies.set(CHALLENGE_COOKIE, await signChallenge(options.challenge, "login"), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/auth", maxAge: 300,
  });
  return res;
}
