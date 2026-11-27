import "server-only";
import { after } from "next/server";
import { db } from "@/lib/supabase";
import { runAnalyst } from "./analyst";
import { buildAnalystFacts } from "./analyst-facts";

/**
 * Create an analyst row and run the analyst in the background (the page polls).
 * Call from a server action. Skips quietly when there's nothing to analyse.
 */
export async function queueAnalyst(month: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: running } = await db()
    .from("finance_checkins")
    .select("id")
    .eq("agent", "analyst")
    .eq("status", "running")
    .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .limit(1);
  if (running?.length) return { ok: false, error: "The analyst is already running." };

  const facts = await buildAnalystFacts(month);
  if (!facts.holdings.length) return { ok: false, error: "There are no investments yet. Upload your DEGIRO exports on Overview." };

  const { data: row, error } = await db()
    .from("finance_checkins")
    .insert({ month, agent: "analyst", status: "running", facts })
    .select("id")
    .single();
  if (error) return { ok: false, error: "Couldn’t start the analyst. Try again." };
  after(() => runAnalyst(row.id, facts));
  return { ok: true };
}
