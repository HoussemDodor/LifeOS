import "server-only";
import { eur } from "@/lib/format";
import { db, hasDatabase } from "@/lib/supabase";
import { compareWithBenchmark, type BenchmarkResult } from "./benchmark";
import { getFinance, type HoldingView } from "./data";

/**
 * Houssem's core–satellite policy (docs/finance-agents.md). LifeOS only
 * measures against it; it never trades.
 */
export const POLICY = {
  core: 0.75, // broad, boring index funds
  satellite: 0.25, // single stocks + crypto
  cryptoCap: 0.05, // of the whole portfolio, inside the satellite
  trimAbove: 0.5, // only then recommend trimming the satellite back toward 25%
} as const;

export type Bucket = "core" | "satellite" | "crypto";

export interface PortfolioHolding {
  symbol: string;
  name: string;
  valueEur: number;
  share: number; // of the invested total
  bucket: Bucket;
  guessed: boolean; // LifeOS's first guess, not moved by hand
  movable: boolean; // DEGIRO holdings can move between core and satellite
  putIn: number | null; // net money put in (buys minus sells, fees included), from the DEGIRO transactions
  gain: number | null; // value now minus putIn
}

export interface PortfolioView {
  isSample: boolean;
  total: number;
  cash: number; // uninvested cash at DEGIRO and Bitvavo, not part of the split
  asOf: { degiro: string | null; bitvavo: string | null };
  parts: { core: number; stocks: number; crypto: number }; // € amounts
  shares: { core: number; satellite: number; crypto: number }; // of total
  holdings: PortfolioHolding[];
  /** Totals over holdings with known trades. */
  result: { putIn: number; worth: number; gain: number; fees: number; trades: number; since: string | null } | null;
  /** The same euros, on the same days, in an all-world fund. Null when prices are unavailable. */
  benchmark: BenchmarkResult | null;
  flags: { kind: "trim" | "crypto" | "drift" | "ok"; text: string }[];
}

/**
 * First guess: broad index funds are core; single stocks and thematic or
 * sector ETFs are satellite. Houssem can move any DEGIRO holding.
 */
export function guessBucket(name: string): "core" | "satellite" {
  const fund = /\b(etf|ucits|index|tracker|fund|acc|dist)\b|vanguard|ishares|xtrackers|spdr|amundi|lyxor|invesco|hsbc|vaneck|northern trust/i.test(name);
  const broad = /all[- ]?world|\bworld\b|acwi|ftse all|msci (world|europe|emerging|usa)|s&p ?500|sp ?500|total (stock )?market|global|emerging markets?|developed|stoxx (europe )?600|europe|north america/i.test(name);
  const thematic = /semiconductor|\btech|clean|energy|robot|\bai\b|artificial|cyber|gold|silver|water|health|bank|reit|real estate|dividend|defen[cs]e|uranium|crypto|bitcoin|blockchain|esports|gaming|small cap|momentum|quality|value/i.test(name);
  return fund && broad && !thematic ? "core" : "satellite";
}

export async function getPortfolio(): Promise<PortfolioView> {
  const { accounts, holdings, isSample } = await getFinance();
  const degiro = accounts.find((a) => a.provider === "degiro");
  const bitvavo = accounts.find((a) => a.provider === "bitvavo");
  const overrides = new Map<string, "core" | "satellite">();
  if (hasDatabase()) {
    const { data } = await db().from("portfolio_buckets").select("symbol,bucket");
    for (const r of data ?? []) overrides.set(r.symbol, r.bucket);
  }

  // Money put in per ISIN, from the DEGIRO transactions export.
  const byIsin = new Map<string, number>();
  const flows: { isin: string; date: string; eur: number }[] = [];
  let fees = 0;
  let tradeCount = 0;
  let since: string | null = null;
  if (hasDatabase()) {
    const { data } = await db().from("portfolio_trades").select("isin,traded_at,total_eur,fees_eur");
    for (const t of data ?? []) {
      if (t.total_eur !== null) {
        byIsin.set(t.isin, (byIsin.get(t.isin) ?? 0) - Number(t.total_eur));
        flows.push({ isin: t.isin, date: t.traded_at, eur: -Number(t.total_eur) });
      }
      fees += -Number(t.fees_eur ?? 0);
      tradeCount++;
      if (!since || t.traded_at < since) since = t.traded_at;
    }
  } else if (isSample) {
    byIsin.set("IE00BK5BQT80", 13950);
    byIsin.set("NL0010273215", 2210);
    fees = 21;
    tradeCount = 9;
    since = "2025-06-02";
  }

  const mine = holdings.filter((h) => h.accountId === degiro?.id || h.accountId === bitvavo?.id);
  const isCash = (h: HoldingView) => h.symbol === "CASH";
  const cash = mine.filter(isCash).reduce((s, h) => s + h.valueEur, 0);
  const invested = mine.filter((h) => !isCash(h) && h.valueEur > 0);
  const total = invested.reduce((s, h) => s + h.valueEur, 0);

  const rows: PortfolioHolding[] = invested
    .map((h) => {
      const crypto = h.accountId === bitvavo?.id;
      const manual = overrides.get(h.symbol);
      return {
        symbol: h.symbol,
        name: h.name,
        valueEur: h.valueEur,
        share: total ? h.valueEur / total : 0,
        bucket: (crypto ? "crypto" : (manual ?? guessBucket(h.name))) as Bucket,
        guessed: !crypto && !manual,
        movable: !crypto,
        putIn: byIsin.has(h.symbol) ? Math.round(byIsin.get(h.symbol)! * 100) / 100 : null,
        gain: byIsin.has(h.symbol) ? Math.round((h.valueEur - byIsin.get(h.symbol)!) * 100) / 100 : null,
      };
    })
    .sort((a, b) => b.valueEur - a.valueEur);

  const known = rows.filter((r) => r.putIn !== null);
  const result = known.length
    ? {
        putIn: known.reduce((s, r) => s + r.putIn!, 0),
        worth: known.reduce((s, r) => s + r.valueEur, 0),
        gain: known.reduce((s, r) => s + r.gain!, 0),
        fees,
        trades: tradeCount,
        since,
      }
    : null;

  // Compare like with like: the money behind what you hold now, valued on your export date.
  const held = new Set(known.map((r) => r.symbol));
  const degiroDate = (degiro && mine.find((h) => h.accountId === degiro.id)?.asOf.slice(0, 10)) ?? new Date().toISOString().slice(0, 10);
  const benchmark: BenchmarkResult | null = isSample && !hasDatabase()
    ? { name: "Vanguard FTSE All-World (Acc)", putIn: 16160, value: 17402.5, gain: 1242.5, gainPct: 7.7, priceDate: degiroDate }
    : await compareWithBenchmark(
        flows.filter((f) => held.has(f.isin)).sort((a, b) => a.date.localeCompare(b.date)),
        degiroDate,
      );

  const sum = (b: Bucket) => rows.filter((r) => r.bucket === b).reduce((s, r) => s + r.valueEur, 0);
  const parts = { core: sum("core"), stocks: sum("satellite"), crypto: sum("crypto") };
  const shares = total
    ? { core: parts.core / total, satellite: (parts.stocks + parts.crypto) / total, crypto: parts.crypto / total }
    : { core: 0, satellite: 0, crypto: 0 };

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const flags: PortfolioView["flags"] = [];
  if (total > 0) {
    if (shares.satellite > POLICY.trimAbove) {
      flags.push({
        kind: "trim",
        text: `Satellite is ${pct(shares.satellite)} of your portfolio, above your 50% line. Your rule says: trim back toward 25%.`,
      });
    }
    if (shares.crypto > POLICY.cryptoCap) {
      const over = parts.crypto - POLICY.cryptoCap * total;
      flags.push({
        kind: "crypto",
        text: `Crypto is ${(shares.crypto * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}% of your portfolio, above your 5% cap by about ${eur(over)}.`,
      });
    }
    if (shares.satellite <= POLICY.trimAbove) {
      const drift = shares.core - POLICY.core;
      const points = Math.round(Math.abs(drift) * 100);
      flags.push(
        points < 2
          ? { kind: "ok", text: "Core and satellite are right on your 75/25 target." }
          : {
              kind: "drift",
              text: `Core is ${pct(shares.core)}, ${points} points ${drift < 0 ? "under" : "over"} your 75% target. You let winners run, so no trimming until the satellite passes 50%. New money can go to the ${drift < 0 ? "core" : "satellite"}.`,
            },
      );
    }
  }

  const latest = (id?: string) =>
    mine.filter((h) => h.accountId === id).reduce<string | null>((d, h) => (!d || h.asOf > d ? h.asOf : d), null);
  return {
    isSample,
    total,
    cash,
    asOf: { degiro: latest(degiro?.id), bitvavo: latest(bitvavo?.id) },
    parts,
    shares,
    holdings: rows,
    result,
    benchmark,
    flags,
  };
}
