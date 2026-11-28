import "server-only";

/**
 * "What if every euro had gone into an all-world fund on the same day?"
 * Benchmark: Vanguard FTSE All-World UCITS ETF (Acc), in euros on Xetra.
 * Accumulating, so its price already includes reinvested dividends.
 *
 * Prices come from Yahoo Finance's public chart data (no key, unofficial):
 * if it's unavailable the comparison is simply left out.
 */
export const BENCHMARK = { name: "Vanguard FTSE All-World (Acc)", isin: "IE00BK5BQT80", ticker: "VWCE.DE" } as const;

export interface BenchmarkResult {
  name: string;
  putIn: number; // net euros moved, same as your own "put in"
  value: number; // what those euros would be worth in the all-world fund
  gain: number;
  gainPct: number;
  priceDate: string; // the closing price used for "now"
}

type Prices = { dates: string[]; closes: number[]; last: number | null };

async function loadPrices(): Promise<Prices | null> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${BENCHMARK.ticker}?range=5y&interval=1d`, {
      headers: { "User-Agent": "Mozilla/5.0 (LifeOS personal dashboard)" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 6 * 3600 }, // prices change once a day; don't ask on every page view
    });
    if (!res.ok) return null;
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    const ts: number[] = r?.timestamp ?? [];
    const close: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
    const dates: string[] = [];
    const closes: number[] = [];
    ts.forEach((t, i) => {
      const c = close[i];
      if (typeof c === "number" && Number.isFinite(c)) {
        dates.push(new Date(t * 1000).toISOString().slice(0, 10));
        closes.push(c);
      }
    });
    if (!dates.length) return null;
    const live = r?.meta?.regularMarketPrice;
    return { dates, closes, last: typeof live === "number" ? live : null };
  } catch (err) {
    console.error("benchmark prices:", err);
    return null;
  }
}

/** The last close on or before a date (markets are shut at weekends and holidays). */
function closeOn(p: Prices, ymd: string): { price: number; date: string } | null {
  let lo = 0;
  let hi = p.dates.length - 1;
  let hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (p.dates[mid] <= ymd) {
      hit = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return hit < 0 ? null : { price: p.closes[hit], date: p.dates[hit] };
}

/**
 * Replay your DEGIRO money flows into the benchmark: each buy buys benchmark
 * units for the same euros that day; each sell sells them. Valued at the
 * date of your DEGIRO export, so both sides use prices from the same day.
 */
export async function compareWithBenchmark(
  flows: { date: string; eur: number }[], // eur > 0 = money in (a buy), < 0 = money out (a sell)
  valueDate: string,
): Promise<BenchmarkResult | null> {
  if (!flows.length) return null;
  const prices = await loadPrices();
  if (!prices) return null;
  let units = 0;
  let putIn = 0;
  for (const f of flows) {
    const c = closeOn(prices, f.date);
    if (!c) return null; // a trade from before the price history: can't compare fairly
    units += f.eur / c.price;
    putIn += f.eur;
  }
  const end = closeOn(prices, valueDate);
  if (!end) return null;
  const value = units * end.price;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    name: BENCHMARK.name,
    putIn: r2(putIn),
    value: r2(value),
    gain: r2(value - putIn),
    gainPct: putIn > 0 ? Math.round(((value - putIn) / putIn) * 1000) / 10 : 0,
    priceDate: end.date,
  };
}
