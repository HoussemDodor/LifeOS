"use server";

import { revalidatePath } from "next/cache";
import { getAiUsageMonth } from "@/lib/ai-usage";
import { isSignedIn } from "@/lib/require-session";
import { db, hasDatabase } from "@/lib/supabase";
import { queueAnalyst } from "./analyst-queue";
import { hasAnthropic } from "./coach";
import { monthToReview } from "./facts";

type Result = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Run the portfolio analyst on its own (the monthly check-in also starts it). */
export async function startAnalysis(): Promise<Result> {
  if (!(await isSignedIn())) return { ok: false, error: "Sign in again." };
  if (!hasDatabase()) return { ok: false, error: "Sample mode: connect Supabase to run the analyst." };
  if (!hasAnthropic()) return { ok: false, error: "Add the Anthropic API key first (see Check-in)." };
  const usage = await getAiUsageMonth();
  if (usage?.capUsd && usage.costUsd >= usage.capUsd) {
    return { ok: false, error: `This month's AI budget (US$ ${usage.capUsd}) is used up.` };
  }
  const res = await queueAnalyst(monthToReview());
  if (!res.ok) return res;
  revalidatePath("/finance/analyst");
  return { ok: true };
}

/** Approve the proposed core make-up, or set it aside. */
export async function decideCorePlan(planId: string, accept: boolean): Promise<Result> {
  if (!(await isSignedIn())) return { ok: false, error: "Sign in again." };
  if (!hasDatabase()) return { ok: true };
  if (!UUID.test(planId) || typeof accept !== "boolean") return { ok: false, error: "That isn’t possible." };
  const now = new Date().toISOString();
  if (accept) {
    await db().from("portfolio_core_plan").update({ status: "replaced" }).eq("status", "active");
    await db().from("portfolio_core_plan").update({ status: "active", decided_at: now }).eq("id", planId);
  } else {
    await db().from("portfolio_core_plan").update({ status: "declined", decided_at: now }).eq("id", planId);
  }
  revalidatePath("/finance/analyst");
  return { ok: true };
}
