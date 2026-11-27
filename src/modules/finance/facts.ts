import "server-only";
import { db } from "@/lib/supabase";

/**
 * The numbers for a monthly check-in, computed by LifeOS (never by the model).
 * Amounts are "your share": a payment minus the Tikkie paybacks linked to it.
 * Transfers, investing and paybacks are neither spending nor income; only the
 * Income category counts as money in, other incoming money is a refund.
 */

export const NEITHER = new Set(["Transfers", "Investing", "Paybacks"]);
const r2 = (n: number) => Math.round(n * 100) / 100;

export const amsterdamYmd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(d);
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
const monthEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** The month a check-in reviews: the previous calendar month (Amsterdam time). */
export const monthToReview = (now = new Date()) => addMonths(amsterdamYmd(now).slice(0, 7), -1);

/** "Albert Heijn 1234" and "ALBERT HEIJN 5678" are the same shop. */
export function shopKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(b\.?v\.?|n\.?v\.?|nl|amsterdam|utrecht|rotterdam)\b/g, " ")
    .replace(/[0-9*#]+/g, " ")
    .replace(/[^a-zà-ÿ&.' -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Row {
  id: string;
  date: string;
  amount: number;
  shop: string;
  description: string | null;
  category: string;
  source: string;
  offsetsId: string | null;
}

export async function loadRows(from: string, to: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db()
      .from("transactions")
      .select("id,booked_at,amount,counterparty,description,category,category_source,offsets_id")
      .gte("booked_at", from)
      .lte("booked_at", to)
      .order("booked_at")
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(`check-in data: ${error.message}`);
    out.push(
      ...data.map((t) => ({
        id: t.id,
        date: t.booked_at,
        amount: Number(t.amount),
        shop: t.counterparty ?? "Unknown",
        description: t.description,
        category: t.category ?? "Other",
        source: t.category_source,
        offsetsId: t.offsets_id,
      })),
    );
    if (data.length < 1000) return out;
  }
}

export interface CheckinFacts {
  month: string;
  data_until: string | null;
  data_complete: boolean;
  months: { month: string; spent: number; received: number; saved: number; by_category: Record<string, number> }[];
  average_last_12: { spent: number; received: number; saved: number };
  review_month: {
    spent: number;
    received: number;
    saved: number;
    vs_average_by_category: { category: string; this_month: number; avg_12m: number; diff: number }[];
    top_shops: { shop: string; times: number; total: number }[];
    transactions: { id: string; date: string; shop: string; your_share: number; category: string; locked: boolean; note?: string }[];
  };
  top_shops_12m: { shop: string; times: number; total: number; months_active: number }[];
  recurring: { shop: string; months_seen_of_6: number; typical_amount: number; last_amount: number; category: string }[];
  target: { monthly_savings: number; saved_this_month: number; hit: boolean } | null;
  promises_to_score: { id: string; text: string; measure: string }[];
  previous_checkin: { month: string; headline: string; savings_ideas: string[] } | null;
}

export async function buildFacts(month: string): Promise<CheckinFacts> {
  const from = `${addMonths(month, -12)}-01`;
  const to = monthEnd(month);
  // Paybacks can arrive a few weeks after the month ends.
  const rows = await loadRows(from, monthEnd(addMonths(month, 1)));

  const paidBack = new Map<string, number>();
  for (const r of rows) if (r.offsetsId && r.amount > 0) paidBack.set(r.offsetsId, (paidBack.get(r.offsetsId) ?? 0) + r.amount);
  const inRange = rows.filter((r) => r.date <= to);
  const share = (r: Row) => (r.amount < 0 ? -Math.max(0, -r.amount - (paidBack.get(r.id) ?? 0)) : r.amount);

  // Per-month totals.
  const months = Array.from({ length: 13 }, (_, i) => addMonths(month, i - 12));
  const monthStats = months.map((m) => {
    const by: Record<string, number> = {};
    let spent = 0;
    let received = 0;
    for (const r of inRange) {
      if (!r.date.startsWith(m) || NEITHER.has(r.category)) continue;
      const s = share(r);
      if (s < 0) {
        spent += -s;
        by[r.category] = r2((by[r.category] ?? 0) - s);
      } else if (r.category === "Income") received += s;
      else {
        // Refund from a shop: lowers that category's spending.
        spent -= s;
        by[r.category] = r2((by[r.category] ?? 0) - s);
      }
    }
    return { month: m, spent: r2(spent), received: r2(received), saved: r2(received - spent), by_category: by };
  });
  const past = monthStats.slice(0, 12).filter((m) => m.spent > 0 || m.received > 0);
  const avg = (f: (m: (typeof monthStats)[number]) => number) => (past.length ? r2(past.reduce((s, m) => s + f(m), 0) / past.length) : 0);
  const review = monthStats[12];

  const categories = new Set([...Object.keys(review.by_category), ...past.flatMap((m) => Object.keys(m.by_category))]);
  const vsAvg = [...categories]
    .map((c) => {
      const avgC = past.length ? r2(past.reduce((s, m) => s + (m.by_category[c] ?? 0), 0) / past.length) : 0;
      const now = review.by_category[c] ?? 0;
      return { category: c, this_month: now, avg_12m: avgC, diff: r2(now - avgC) };
    })
    .sort((a, b) => b.this_month - a.this_month);

  // Shops.
  const spend = inRange.filter((r) => r.amount < 0 && !NEITHER.has(r.category));
  const shopAgg = (list: Row[]) => {
    const m = new Map<string, { shop: string; times: number; total: number; months: Set<string> }>();
    for (const r of list) {
      const k = shopKey(r.shop) || r.shop.toLowerCase();
      const e = m.get(k) ?? { shop: r.shop, times: 0, total: 0, months: new Set<string>() };
      e.times++;
      e.total += -share(r);
      e.months.add(r.date.slice(0, 7));
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  };
  const reviewSpend = spend.filter((r) => r.date.startsWith(month));
  const topMonth = shopAgg(reviewSpend)
    .slice(0, 15)
    .map((s) => ({ shop: s.shop, times: s.times, total: r2(s.total) }));
  const top12 = shopAgg(spend)
    .slice(0, 25)
    .map((s) => ({ shop: s.shop, times: s.times, total: r2(s.total), months_active: s.months.size }));

  // Recurring: the same shop in at least 3 of the last 6 months, with a steady amount.
  const last6 = new Set(months.slice(7));
  const byShop = new Map<string, Row[]>();
  for (const r of spend) {
    if (!last6.has(r.date.slice(0, 7))) continue;
    const k = shopKey(r.shop) || r.shop.toLowerCase();
    byShop.set(k, [...(byShop.get(k) ?? []), r]);
  }
  const recurring = [...byShop.values()]
    .map((list) => {
      const seen = new Set(list.map((r) => r.date.slice(0, 7))).size;
      const amounts = list.map((r) => -r.amount).sort((a, b) => a - b);
      const typical = amounts[Math.floor(amounts.length / 2)];
      const steady = amounts.filter((a) => Math.abs(a - typical) <= Math.max(1, typical * 0.15)).length >= seen;
      return { list, seen, typical, steady };
    })
    .filter((x) => x.seen >= 3 && x.steady)
    .map((x) => ({
      shop: x.list[0].shop,
      months_seen_of_6: x.seen,
      typical_amount: r2(x.typical),
      last_amount: r2(-x.list.at(-1)!.amount),
      category: x.list.at(-1)!.category,
    }))
    .sort((a, b) => b.typical_amount - a.typical_amount)
    .slice(0, 30);

  // The review month's own transactions (what the coach can cite and recategorise).
  const reviewRows = inRange.filter((r) => r.date.startsWith(month));
  const transactions = reviewRows.map((r) => ({
    id: r.id,
    date: r.date,
    shop: r.shop,
    your_share: r2(share(r)),
    category: r.category,
    locked: r.source === "manual",
    ...(r.category === "Other" && r.description ? { note: r.description.slice(0, 80) } : {}),
  }));

  const dataUntil = rows.reduce<string | null>((d, r) => (!d || r.date > d ? r.date : d), null);

  // Target and promises.
  const { data: target } = await db()
    .from("finance_targets")
    .select("monthly_savings")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: promises } = await db()
    .from("finance_promises")
    .select("id,text,measure")
    .eq("status", "accepted")
    .eq("month", month)
    .is("result", null);
  const { data: prev } = await db()
    .from("finance_checkins")
    .select("month,report")
    .eq("agent", "coach")
    .eq("status", "done")
    .lt("month", month)
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    month,
    data_until: dataUntil,
    // Bank exports trail a day or two; within 3 days of month end counts as complete.
    data_complete: Boolean(dataUntil && dataUntil >= addDaysYmd(to, -3)),
    months: monthStats,
    average_last_12: { spent: avg((m) => m.spent), received: avg((m) => m.received), saved: avg((m) => m.saved) },
    review_month: {
      spent: review.spent,
      received: review.received,
      saved: review.saved,
      vs_average_by_category: vsAvg,
      top_shops: topMonth,
      transactions,
    },
    top_shops_12m: top12,
    recurring,
    target: target
      ? { monthly_savings: Number(target.monthly_savings), saved_this_month: review.saved, hit: review.saved >= Number(target.monthly_savings) }
      : null,
    promises_to_score: promises ?? [],
    previous_checkin: prev
      ? {
          month: prev.month,
          headline: prev.report?.headline ?? "",
          savings_ideas: (prev.report?.savings_ideas ?? []).map((s: { idea: string }) => s.idea),
        }
      : null,
  };
}

function addDaysYmd(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
