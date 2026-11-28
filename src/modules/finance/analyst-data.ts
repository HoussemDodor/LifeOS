import "server-only";
import { db, hasDatabase } from "@/lib/supabase";
import type { AnalystReport } from "./analyst";
import type { AnalystFacts } from "./analyst-facts";

export interface AnalystRun {
  id: string;
  month: string;
  status: "running" | "done" | "failed";
  report: AnalystReport | null;
  facts: AnalystFacts | null;
  error: string | null;
  finishedAt: string | null;
}
export interface CorePlan {
  id: string;
  status: "proposed" | "active";
  plan: { name: string; isin: string; share_of_core_pct: number; why: string }[];
  reasoning: string | null;
}
export interface AnalystPageData {
  current: AnalystRun | null;
  history: { id: string; month: string; headline: string | null; status: string; createdAt: string }[];
  plans: CorePlan[];
  isSample: boolean;
}

export async function getAnalystPage(id?: string): Promise<AnalystPageData> {
  if (!hasDatabase()) return sample();
  const { data: rows } = await db()
    .from("finance_checkins")
    .select("id,month,status,report,created_at")
    .eq("agent", "analyst")
    .order("created_at", { ascending: false })
    .limit(24);
  const history = (rows ?? []).map((r) => ({
    id: r.id,
    month: r.month,
    headline: r.report?.headline ?? null,
    status: r.status,
    createdAt: r.created_at,
  }));
  const pick = id ? history.find((h) => h.id === id) : history[0];
  let current: AnalystRun | null = null;
  if (pick) {
    const { data } = await db().from("finance_checkins").select("id,month,status,report,facts,error,finished_at").eq("id", pick.id).single();
    if (data) current = { id: data.id, month: data.month, status: data.status, report: data.report, facts: data.facts, error: data.error, finishedAt: data.finished_at };
  }
  const { data: plans } = await db()
    .from("portfolio_core_plan")
    .select("id,status,plan,reasoning")
    .in("status", ["proposed", "active"])
    .order("created_at", { ascending: false });
  return { current, history, plans: (plans ?? []) as CorePlan[], isSample: false };
}

/* ---------- Example for local preview (no database) ---------- */

function sample(): AnalystPageData {
  const src = (title: string, url: string, date: string) => ({ title, url, date });
  const report: AnalystReport = {
    headline: "Core is healthy, ASML is the one position to watch",
    briefing:
      "## The verdict\n- Worth **€ 18.463**, up **€ 1.319 (8,2%)** on what you put in.\n- Split is **83/17**: more core than your 75/25, which is fine. Your rule only asks for action when the satellite passes 50%.\n- Crypto is **5,3%**, just over your 5% cap.\n\n## Core\nOne fund, Vanguard FTSE All-World, at a TER of **0,22%**. That's exactly the broad, boring core your rules ask for.\n\n## Satellite\n- **ASML** is down **6,3%** since your buys. The business case holds, but orders are lumpy and China export rules are a real risk. Hold, don't add yet.\n- **Bitcoin** is slightly over the cap. Don't buy more until it's back under 5%.\n\n## New money\nYour next euros go to the core until the split is back toward 75/25.",
    core: {
      assessment: "Broad, global and cheap: 3.700+ companies across developed and emerging markets at 0,22% a year.",
      overlap: [{ stock: "ASML Holding", fund: "Vanguard FTSE All-World", weight_pct: 0.4 }],
      currency_note: "About 63% of the core is in US companies, so roughly half your portfolio moves with the dollar.",
      plan: {
        kind: "propose",
        funds: [{ name: "Vanguard FTSE All-World UCITS ETF (Acc)", isin: "IE00BK5BQT80", share_of_core_pct: 100, why: "One fund covers the whole world market, matches your benchmark, costs 0,22%." }],
        reasoning: "You already hold the fund that is your benchmark. Keeping the core to this one fund is the simplest way to stay broad and cheap.",
      },
    },
    positions: [
      { isin: "NL0010273215", verdict: "hold", one_liner: "Case intact, but orders are lumpy and China rules are a real risk.", size_note: "11,2% of your portfolio: a normal satellite size." },
    ],
    new_money: "Put the next € 500–1.000 into the All-World fund until core is back near 75%. No new crypto while it's above 5%.",
    watch: ["ASML Q4 results on 28 January", "Crypto back under 5% of the portfolio"],
    research: {
      funds: [
        {
          isin: "IE00BK5BQT80",
          name: "Vanguard FTSE All-World",
          cached: false,
          index_tracked: "FTSE All-World",
          ter_pct: 0.22,
          holdings_count: 3742,
          distribution: "accumulating",
          top_holdings: [
            { name: "Apple", weight_pct: 4.3 },
            { name: "Microsoft", weight_pct: 3.9 },
            { name: "Nvidia", weight_pct: 3.8 },
          ],
          regions: [
            { region: "North America", weight_pct: 63.1 },
            { region: "Europe", weight_pct: 15.2 },
          ],
          top_sectors: [{ sector: "Technology", weight_pct: 27.4 }],
          as_of: "2026-10-31",
          notes: "",
          sources: [src("Vanguard FTSE All-World UCITS ETF", "https://www.vanguard.nl/", "2026-10-31")],
        },
      ],
      stocks: [
        {
          isin: "NL0010273215",
          name: "ASML Holding",
          business: "Makes the lithography machines every advanced chip factory needs.",
          latest_results: { text: "Q3 2026: sales € 7,5 bn, up 12% year on year; gross margin 51,6%. Bookings fell to € 4,9 bn.", date: "2026-10-15", source_url: "https://www.asml.com/" },
          valuation: { text: "About 32× expected earnings, close to its five-year average.", date: "2026-11-20", source_url: "https://www.example.com/asml-valuation" },
          news: [{ text: "New US export rules limit servicing of machines in China from 2027.", date: "2026-11-04", source_url: "https://www.example.com/asml-china" }],
          thesis_check: "Demand for advanced chips keeps the long-term case intact. The bear case: China was a quarter of sales and bookings are falling.",
          risks: ["China export rules", "Chip spending cycle"],
          verdict: "hold",
          verdict_reason: "Case intact, valuation fair, no reason to add before bookings recover.",
          sources: [src("ASML Q3 2026 results", "https://www.asml.com/", "2026-10-15")],
        },
      ],
    },
    failed: [],
  };
  const now = new Date().toISOString();
  return {
    current: {
      id: "00000000-0000-4000-8000-0000000000a1",
      month: "2026-10",
      status: "done",
      report,
      facts: {
        today: now.slice(0, 10),
        degiro_export_date: now.slice(0, 10),
        bitvavo_connected: true,
        policy: { core_pct: 75, satellite_pct: 25, crypto_cap_pct: 5, trim_satellite_above_pct: 50 },
        totals: { worth_eur: 18463, put_in_eur: 16160, gain_eur: 1319, gain_pct: 8.2, trading_costs_eur: 21, uninvested_cash_eur: 0 },
        split_pct: { core: 83.5, satellite: 16.5, crypto: 5.3 },
        benchmark: null,
        rule_checks: [],
        holdings: [
          { isin: "NL0010273215", name: "ASML Holding", group: "satellite", value_eur: 2070.6, share_of_portfolio_pct: 11.2, put_in_eur: 2210, gain_eur: -139.4, gain_pct: -6.3, buys: [] },
        ],
        core_plan: null,
        previous_report: null,
      },
      error: null,
      finishedAt: now,
    },
    history: [{ id: "00000000-0000-4000-8000-0000000000a1", month: "2026-10", headline: report.headline, status: "done", createdAt: now }],
    plans: [{ id: "00000000-0000-4000-8000-0000000000b1", status: "proposed", plan: report.core.plan.funds, reasoning: report.core.plan.reasoning }],
    isSample: true,
  };
}
