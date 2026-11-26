import { jwtVerify, SignJWT } from "jose";

/** Edge-safe (used by middleware): no Node-only imports in this file. */

export const SESSION_COOKIE = "lifeos_session";
export const CHALLENGE_COOKIE = "lifeos_challenge";
const SESSION_DAYS = 30;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  return new TextEncoder().encode(s);
}

export async function createSessionToken(method: "passkey" | "magic-link"): Promise<string> {
  return new SignJWT({ method })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("owner")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.sub === "owner";
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

/** Short-lived signed cookie that carries the WebAuthn challenge between options and verify. */
export async function signChallenge(challenge: string, purpose: "register" | "login"): Promise<string> {
  return new SignJWT({ challenge, purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("5m")
    .sign(secret());
}

export async function readChallenge(token: string | undefined, purpose: "register" | "login"): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.purpose === purpose && typeof payload.challenge === "string" ? payload.challenge : null;
  } catch {
    return null;
  }
}

/** Local development only: lets you preview the app before passkeys are set up. */
export function devBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_BYPASS === "true";
}
