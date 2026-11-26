import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { db } from "./supabase";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export interface StoredPasskey {
  id: string; // base64url credential id
  public_key: string; // base64url
  counter: number;
  transports: AuthenticatorTransportFuture[] | null;
  label: string | null;
}

export function rp() {
  const rpID = process.env.RP_ID ?? "localhost";
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  return { rpID, origin, rpName: "LifeOS" };
}

export async function listPasskeys(): Promise<StoredPasskey[]> {
  const { data, error } = await db().from("passkeys").select("*");
  if (error) throw error;
  return data as StoredPasskey[];
}

export async function getPasskey(id: string): Promise<StoredPasskey | null> {
  const { data, error } = await db().from("passkeys").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as StoredPasskey | null;
}

export async function savePasskey(p: StoredPasskey) {
  const { error } = await db().from("passkeys").insert(p);
  if (error) throw error;
}

export async function updateCounter(id: string, counter: number) {
  const { error } = await db().from("passkeys").update({ counter, last_used_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function isSignedIn(): Promise<boolean> {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Registering a new passkey needs either a session or the one-time SETUP_TOKEN. */
export function setupTokenMatches(given: unknown): boolean {
  const expected = process.env.SETUP_TOKEN;
  if (!expected || typeof given !== "string") return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
