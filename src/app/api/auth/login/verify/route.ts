import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { getPasskey, rp, updateCounter } from "@/lib/passkeys";
import { CHALLENGE_COOKIE, createSessionToken, readChallenge, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.response?.id) return NextResponse.json({ error: "Missing response." }, { status: 400 });

  const challenge = await readChallenge((await cookies()).get(CHALLENGE_COOKIE)?.value, "login");
  if (!challenge) return NextResponse.json({ error: "This request expired. Try again." }, { status: 400 });

  const passkey = await getPasskey(body.response.id);
  if (!passkey) return NextResponse.json({ error: "This passkey isn't registered with LifeOS." }, { status: 401 });

  const { rpID, origin } = rp();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.id,
        publicKey: isoBase64URL.toBuffer(passkey.public_key),
        counter: passkey.counter,
        transports: passkey.transports ?? undefined,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
  if (!verification.verified) return NextResponse.json({ error: "Passkey could not be verified." }, { status: 401 });

  await updateCounter(passkey.id, verification.authenticationInfo.newCounter);

  const res = NextResponse.json({ ok: true });
  res.cookies.delete({ name: CHALLENGE_COOKIE, path: "/api/auth" });
  res.cookies.set(SESSION_COOKIE, await createSessionToken("passkey"), sessionCookieOptions);
  return res;
}
