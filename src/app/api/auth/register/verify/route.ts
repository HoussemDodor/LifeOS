import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { isSignedIn, rp, savePasskey, setupTokenMatches } from "@/lib/passkeys";
import { CHALLENGE_COOKIE, createSessionToken, readChallenge, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.response) return NextResponse.json({ error: "Missing response." }, { status: 400 });
  if (!(await isSignedIn()) && !setupTokenMatches(body.setupToken)) {
    return NextResponse.json({ error: "Setup code is wrong or missing." }, { status: 403 });
  }

  const challenge = await readChallenge((await cookies()).get(CHALLENGE_COOKIE)?.value, "register");
  if (!challenge) return NextResponse.json({ error: "This request expired. Try again." }, { status: 400 });

  const { rpID, origin } = rp();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Passkey could not be verified." }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;
  await savePasskey({
    id: credential.id,
    public_key: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? null,
    label: typeof body.label === "string" ? body.label.slice(0, 60) : null,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.delete({ name: CHALLENGE_COOKIE, path: "/api/auth" });
  res.cookies.set(SESSION_COOKIE, await createSessionToken("passkey"), sessionCookieOptions);
  return res;
}
