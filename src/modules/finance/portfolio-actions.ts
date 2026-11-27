"use server";

import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/require-session";
import { db, hasDatabase } from "@/lib/supabase";

type Result = { ok: true } | { ok: false; error: string };

/** Move a DEGIRO holding between core and satellite. The choice is kept for later uploads. */
export async function setBucket(symbol: string, bucket: "core" | "satellite"): Promise<Result> {
  if (!(await isSignedIn())) return { ok: false, error: "Sign in again." };
  if (!hasDatabase()) return { ok: true };
  if (typeof symbol !== "string" || !symbol || symbol.length > 40 || symbol === "CASH") return { ok: false, error: "That isn’t possible." };
  if (bucket !== "core" && bucket !== "satellite") return { ok: false, error: "That isn’t possible." };
  const { error } = await db()
    .from("portfolio_buckets")
    .upsert({ symbol, bucket, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Couldn’t save that. Try again." };
  revalidatePath("/finance/portfolio");
  return { ok: true };
}
