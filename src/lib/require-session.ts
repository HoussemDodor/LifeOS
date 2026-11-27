import "server-only";
import { cookies } from "next/headers";
import { devBypassEnabled, SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * For server actions: the middleware already gates every page, but an action
 * checks again so it never runs for a signed-out caller.
 */
export async function isSignedIn(): Promise<boolean> {
  if (devBypassEnabled()) return true;
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}
