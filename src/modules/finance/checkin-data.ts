import "server-only";
import { db, hasDatabase } from "@/lib/supabase";
import type { CoachReport } from "./coach";
import type { CheckinFacts } from "./facts";

export interface PromiseView {
  id: string;
  text: string;
  measure: string;
  status: "proposed" | "accepted" | "declined";
  result: "hit" | "partly" | "missed" | null;
  evidence: string | null;
}

export interface CheckinView {
  id: string;
  month: string;
  status: "running" | "done" | "failed";
  report: CoachReport | null;
  facts: Pick<CheckinFacts, "data_until" | "data_complete" | "review_month" | "target"> | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } | null;
  newPromises: PromiseView[];
  scoredPromises: PromiseView[];
  changes: { id: string; shop: string; amount: number; from: string | null; to: string; reason: string | null; undone: boolean }[];
}

export interface CheckinPageData {
  current: CheckinView | null;
  history: { id: string; month: string; headline: string | null; status: string }[];
  target: { id: string; monthly_savings: number; status: "proposed" | "active"; reasoning: string | null }[];
}

const PROMISE_COLS = "id,text,measure,status,result,evidence";

export async function getCheckinPage(id?: string): Promise<CheckinPageData> {
  if (!hasDatabase()) return sampleCheckin();

  const { data: history } = await db()
    .from("finance_checkins")
    .select("id,month,status,report,created_at")
    .eq("agent", "coach")
    .order("created_at", { ascending: false })
    .limit(24);
  const list = (history ?? []).map((h) => ({ id: h.id, month: h.month, headline: h.report?.headline ?? null, status: h.status }));
  const pick = id ? list.find((h) => h.id === id) : list[0];

  const { data: targets } = await db()
    .from("finance_targets")
    .select("id,monthly_savings,status,reasoning")
    .in("status", ["proposed", "active"])
    .order("created_at", { ascending: false });

  const target = (targets ?? []).map((t) => ({ ...t, monthly_savings: Number(t.monthly_savings) }));
  if (!pick) return { current: null, history: list, target };

  const { data: c } = await db()
    .from("finance_checkins")
    .select("id,month,status,report,facts,error,created_at,finished_at,usage")
    .eq("id", pick.id)
    .single();
  if (!c) return { current: null, history: list, target };

  const [{ data: fresh }, { data: scored }, { data: changes }] = await Promise.all([
    db().from("finance_promises").select(PROMISE_COLS).eq("checkin_id", c.id).order("created_at"),
    db().from("finance_promises").select(PROMISE_COLS).eq("scored_in", c.id).order("created_at"),
    db()
      .from("finance_agent_changes")
      .select("id,from_category,to_category,reason,undone,transactions(counterparty,amount)")
      .eq("checkin_id", c.id),
  ]);

  // A run that never finished (e.g. the server timed out) shows as failed after 10 minutes.
  const stale = c.status === "running" && Date.now() - Date.parse(c.created_at) > 10 * 60_000;

  return {
    history: list,
    target,
    current: {
      id: c.id,
      month: c.month,
      status: stale ? "failed" : c.status,
      report: c.report,
      facts: c.facts,
      error: stale ? "The check-in took too long and was stopped. Run it again." : c.error,
      createdAt: c.created_at,
      finishedAt: c.finished_at,
      usage: c.usage,
      newPromises: fresh ?? [],
      scoredPromises: scored ?? [],
      changes: (changes ?? []).map((ch) => {
        const t = ch.transactions as unknown as { counterparty: string | null; amount: number } | null;
        return {
          id: ch.id,
          shop: t?.counterparty ?? "Transaction",
          amount: Number(t?.amount ?? 0),
          from: ch.from_category,
          to: ch.to_category,
          reason: ch.reason,
          undone: ch.undone,
        };
      }),
    },
  };
}

/** Local preview without a database: an example report, clearly marked as such on screen. */
function sampleCheckin(): CheckinPageData {
  const report: CoachReport = {
    headline: "Solid month, but Thuisbezorgd is eating your savings",
    briefing: [
      "## The verdict",
      "You spent **€ 1.840** and **€ 3.100** came in, so you saved **€ 1.260**. That's € 180 better than your 12-month average. Rent did most of the damage, as usual.",
      "## Where it went",
      "- **Eating out: € 312** (avg € 205). 14 Thuisbezorgd orders for € 212. That's basically a second subscription.",
      "- **Groceries: € 386**, right on your average. Albert Heijn 19 times, so small trips add up.",
      "- **Shopping: € 240**, mostly one Coolblue order. Fine if you needed it.",
      "## Recurring stuff",
      "Netflix, Spotify and Disney+ together are **€ 39 a month**. Be honest: when did you last open Disney+?",
      "## Bottom line",
      "Good month overall. Cut the delivery habit in half and you're at your target without trying.",
    ].join("\n"),
    savings_ideas: [
      { idea: "Halve Thuisbezorgd orders (14 → 7 a month)", eur_per_year: 1272 },
      { idea: "Cancel Disney+", eur_per_year: 120 },
    ],
    target: { kind: "propose", monthly_savings_eur: 1000, reasoning: "You saved € 1.080 on average over 12 months; € 1.000 is realistic with room for a bad month." },
    promise_scores: [],
    new_promises: [],
    recategorize: [],
  };
  const p = (id: string, text: string, measure: string, status: PromiseView["status"], result: PromiseView["result"] = null, evidence: string | null = null): PromiseView => ({ id, text, measure, status, result, evidence });
  return {
    history: [
      { id: "s1", month: "2026-10", headline: report.headline, status: "done" },
      { id: "s0", month: "2026-09", headline: "Holiday month: expensive, but you knew that", status: "done" },
    ],
    target: [{ id: "t1", monthly_savings: 1000, status: "proposed", reasoning: report.target.reasoning }],
    current: {
      id: "s1",
      month: "2026-10",
      status: "done",
      report,
      facts: { data_until: "2026-10-31", data_complete: true, review_month: { spent: 1840, received: 3100, saved: 1260, vs_average_by_category: [], top_shops: [], transactions: [] }, target: null },
      error: null,
      createdAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      usage: null,
      newPromises: [
        p("p1", "Max 7 Thuisbezorgd orders in November", "Count of Thuisbezorgd payments in November ≤ 7", "proposed"),
        p("p2", "Cancel Disney+ before the next charge", "No Disney+ payment in November", "proposed"),
      ],
      scoredPromises: [p("p0", "Spend under € 350 on groceries", "Groceries total ≤ € 350", "accepted", "missed", "€ 386 on groceries, € 36 over.")],
      changes: [{ id: "c1", shop: "PAYPAL *STEAM", amount: -19.99, from: "Other", to: "Subscriptions", reason: "Steam purchase via PayPal", undone: false }],
    },
  };
}
