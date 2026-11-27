"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { isSignedIn } from "@/lib/require-session";
import { db, hasDatabase } from "@/lib/supabase";
import { hasAnthropic, runCoach } from "./coach";
import { buildFacts, monthToReview } from "./facts";

type Result = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const refresh = () => {
  revalidatePath("/finance/checkin");
  revalidatePath("/finance");
};

/** Start the monthly check-in. The coach runs in the background; the page polls for the result. */
export async function startCheckin(): Promise<Result> {
  if (!(await isSignedIn())) return { ok: false, error: "Sign in again." };
  if (!hasDatabase()) return { ok: false, error: "Sample mode: connect Supabase to run a check-in." };
  if (!hasAnthropic()) return { ok: false, error: "Add the Anthropic API key first (see below)." };

  const { data: running } = await db()
    .from("finance_checkins")
    .select("id")
    .eq("status", "running")
    .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .limit(1);
  if (running?.length) return { ok: false, error: "A check-in is already running." };

  const month = monthToReview();
  const facts = await buildFacts(month);
  if (!facts.review_month.transactions.length) {
    return { ok: false, error: `There are no transactions for ${month} yet. Upload your ING export first.` };
  }

  const { data: row, error } = await db()
    .from("finance_checkins")
    .insert({ month, agent: "coach", status: "running", facts })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Couldn’t start the check-in. Try again." };

  after(() => runCoach(row.id, facts));
  refresh();
  return { ok: true };
}

/** Accept the coach's proposed target (optionally with your own amount), or decline it. */
export async function decideTarget(targetId: string, amount: number | null): Promise<Result> {
  if (!(await isSignedIn())) return { ok: false, error: "Sign in again." };
  if (!hasDatabase()) return { ok: true };
  if (!UUID.test(targetId)) return { ok: false, error: "That isn’t possible." };
  const now = new Date().toISOString();
  if (amount === null) {
    await db().from("finance_targets").update({ status: "declined", decided_at: now }).eq("id", targetId);
  } else {
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) return { ok: false, error: "Enter an amount above € 0." };
    await db().from("finance_targets").update({ status: "replaced" }).eq("status", "active");
    await db()
      .from("finance_targets")
      .update({ status: "active", monthly_savings: Math.round(amount * 100) / 100, decided_at: now })
      .eq("id", targetId);
  }
  refresh();
  return { ok: true };
}

/** Accept or skip one of the coach's promises for next month. */
export async function decidePromise(promiseId: string, accept: boolean): Promise<Result> {
  if (!(await isSignedIn())) return { ok: false, error: "Sign in again." };
  if (!hasDatabase()) return { ok: true };
  if (!UUID.test(promiseId) || typeof accept !== "boolean") return { ok: false, error: "That isn’t possible." };
  await db().from("finance_promises").update({ status: accept ? "accepted" : "declined" }).eq("id", promiseId);
  refresh();
  return { ok: true };
}

/** Undo a category change the coach made. The transaction then counts as fixed by you. */
export async function undoChange(changeId: string): Promise<Result> {
  if (!(await isSignedIn())) return { ok: false, error: "Sign in again." };
  if (!hasDatabase()) return { ok: true };
  if (!UUID.test(changeId)) return { ok: false, error: "That isn’t possible." };
  const { data: change } = await db()
    .from("finance_agent_changes")
    .select("transaction_id,from_category,undone")
    .eq("id", changeId)
    .single();
  if (!change || change.undone) return { ok: true };
  await db()
    .from("transactions")
    .update({ category: change.from_category ?? "Other", category_source: "manual" })
    .eq("id", change.transaction_id);
  await db().from("finance_agent_changes").update({ undone: true }).eq("id", changeId);
  refresh();
  return { ok: true };
}
