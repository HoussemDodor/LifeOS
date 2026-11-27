import "server-only";
import { db } from "@/lib/supabase";
import { amsterdamYmd } from "./facts";
import { getPortfolio, POLICY } from "./portfolio";

/**
 * Everything LifeOS knows about the portfolio, computed in code. The analyst
 * interprets these numbers and adds dated research; it never recomputes them.
 */
export interface AnalystFacts {
  today: string;
  degiro_export_date: string | null;
  bitvavo_connected: boolean;
  policy: { core_pct: number; satellite_pct: number; crypto_cap_pct: number; trim_satellite_above_pct: number };
  totals: { worth_eur: number; put_in_eur: number | null; gain_eur: number | null; gain_pct: number | null; trading_costs_eur: number | null; uninvested_cash_eur: number };
  split_pct: { core: number; satellite: number; crypto: number };
  rule_checks: string[];
  holdings: {
    isin: string;
    name: string;
    group: "core" | "satellite" | "crypto";
    value_eur: number;
    share_of_portfolio_pct: number;
    put_in_eur: number | null;
    gain_eur: number | null;
    gain_pct: number | null;
    buys: { date: string; quantity: number; price: number | null; currency: string | null; eur: number | null }[];
  }[];
  core_plan: { status: "active" | "proposed"; plan: unknown; reasoning: string | null } | null;
  previous_report: { month: string; headline: string; positions: { isin: string; verdict: string; one_liner: string }[] } | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function buildAnalystFacts(month: string): Promise<AnalystFacts> {
  const p = await getPortfolio();
  const { data: trades } = await db()
    .from("portfolio_trades")
    .select("isin,traded_at,quantity,price,currency,total_eur")
    .order("traded_at");
  const { data: plan } = await db()
    .from("portfolio_core_plan")
    .select("plan,reasoning,status")
    .in("status", ["active", "proposed"])
    .order("created_at", { ascending: false });
  const { data: prev } = await db()
    .from("finance_checkins")
    .select("month,report")
    .eq("agent", "analyst")
    .eq("status", "done")
    .lt("month", month)
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();

  const active = plan?.find((x) => x.status === "active") ?? plan?.find((x) => x.status === "proposed") ?? null;
  return {
    today: amsterdamYmd(new Date()),
    degiro_export_date: p.asOf.degiro?.slice(0, 10) ?? null,
    bitvavo_connected: Boolean(p.asOf.bitvavo),
    policy: {
      core_pct: POLICY.core * 100,
      satellite_pct: POLICY.satellite * 100,
      crypto_cap_pct: POLICY.cryptoCap * 100,
      trim_satellite_above_pct: POLICY.trimAbove * 100,
    },
    totals: {
      worth_eur: r2(p.total),
      put_in_eur: p.result ? r2(p.result.putIn) : null,
      gain_eur: p.result ? r2(p.result.gain) : null,
      gain_pct: p.result ? r1((p.result.gain / p.result.putIn) * 100) : null,
      trading_costs_eur: p.result ? r2(p.result.fees) : null,
      uninvested_cash_eur: r2(p.cash),
    },
    split_pct: { core: r1(p.shares.core * 100), satellite: r1(p.shares.satellite * 100), crypto: r1(p.shares.crypto * 100) },
    rule_checks: p.flags.map((f) => f.text),
    holdings: p.holdings.map((h) => ({
      isin: h.symbol,
      name: h.name,
      group: h.bucket,
      value_eur: r2(h.valueEur),
      share_of_portfolio_pct: r1(h.share * 100),
      put_in_eur: h.putIn,
      gain_eur: h.gain,
      gain_pct: h.gain !== null && h.putIn ? r1((h.gain / h.putIn) * 100) : null,
      buys: (trades ?? [])
        .filter((t) => t.isin === h.symbol)
        .map((t) => ({
          date: t.traded_at,
          quantity: Number(t.quantity),
          price: t.price === null ? null : Number(t.price),
          currency: t.currency,
          eur: t.total_eur === null ? null : -Number(t.total_eur),
        })),
    })),
    core_plan: active ? { status: active.status, plan: active.plan, reasoning: active.reasoning } : null,
    previous_report: prev
      ? {
          month: prev.month,
          headline: prev.report?.headline ?? "",
          positions: (prev.report?.positions ?? []).map((x: { isin: string; verdict: string; one_liner: string }) => ({
            isin: x.isin,
            verdict: x.verdict,
            one_liner: x.one_liner,
          })),
        }
      : null,
  };
}
