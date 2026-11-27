import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/supabase";
import { NEITHER, loadRows, shopKey, type Row } from "./facts";
import { CATEGORIES } from "./ing-csv";

/**
 * The coach chat's tools. All of them only read: nothing here writes to the
 * database, so the chat can't change goals, promises or transactions.
 * LifeOS does the arithmetic; the model only gets the results.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
/** IBANs and long account numbers never go to the API (finance-agents.md). */
const scrub = (s: string | null) => (s ? s.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, "[account]").replace(/\b\d{9,}\b/g, "[number]") : null);

function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Rows in [from, to] with "your share" (minus linked paybacks, which may arrive up to ~6 weeks later). */
async function rowsWithShare(from: string, to: string) {
  const rows = await loadRows(from, addDays(to, 45));
  const paidBack = new Map<string, number>();
  for (const r of rows) if (r.offsetsId && r.amount > 0) paidBack.set(r.offsetsId, (paidBack.get(r.offsetsId) ?? 0) + r.amount);
  const share = (r: Row) => (r.amount < 0 ? -Math.max(0, -r.amount - (paidBack.get(r.id) ?? 0)) : r.amount);
  return rows.filter((r) => r.date <= to).map((r) => ({ ...r, share: r2(share(r)) }));
}

const Range = z
  .object({ from: YMD, to: YMD })
  .refine((v) => v.from <= v.to, "from must be on or before to")
  .refine((v) => Date.parse(v.to) - Date.parse(v.from) <= 3 * 366 * 86_400_000, "Keep the range under 3 years");

const FindInput = z.object({
  from: YMD,
  to: YMD,
  category: z.enum(CATEGORIES).optional(),
  search: z.string().max(80).optional(),
  direction: z.enum(["out", "in", "any"]).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
const TotalsInput = z.object({
  from: YMD,
  to: YMD,
  group_by: z.enum(["category", "shop", "month"]),
  category: z.enum(CATEGORIES).optional(),
  search: z.string().max(80).optional(),
});
const SearchChatsInput = z.object({ query: z.string().min(2).max(80) });
const RecurringInput = z.object({ months: z.number().int().min(3).max(12).optional() });
const NoInput = z.object({}).passthrough();

const matches = (r: Row, search?: string) =>
  !search || `${r.shop} ${r.description ?? ""}`.toLowerCase().includes(search.toLowerCase());

async function findTransactions(raw: unknown) {
  const i = FindInput.parse(raw);
  Range.parse(i);
  const dir = i.direction ?? "any";
  const all = (await rowsWithShare(i.from, i.to)).filter(
    (r) =>
      (!i.category || r.category === i.category) &&
      matches(r, i.search) &&
      (dir === "any" || (dir === "out" ? r.amount < 0 : r.amount > 0)),
  );
  const limit = i.limit ?? 100;
  const biggestFirst = [...all].sort((a, b) => Math.abs(b.share) - Math.abs(a.share)).slice(0, limit);
  return {
    matching: all.length,
    sum_amount: r2(all.reduce((s, r) => s + r.amount, 0)),
    sum_your_share: r2(all.reduce((s, r) => s + r.share, 0)),
    shown: biggestFirst.length,
    note: all.length > limit ? `Showing the ${limit} largest of ${all.length}. Sums cover all of them.` : undefined,
    transactions: biggestFirst
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        date: r.date,
        shop: r.shop,
        amount: r.amount,
        your_share: r.share,
        category: r.category,
        description: scrub(r.description)?.slice(0, 120) ?? undefined,
      })),
  };
}

async function spendingTotals(raw: unknown) {
  const i = TotalsInput.parse(raw);
  Range.parse(i);
  const rows = (await rowsWithShare(i.from, i.to)).filter(
    (r) => !NEITHER.has(r.category) && r.category !== "Income" && (!i.category || r.category === i.category) && matches(r, i.search),
  );
  const groups = new Map<string, { key: string; spent: number; payments: number; refunds: number; months: Set<string> }>();
  for (const r of rows) {
    const key = i.group_by === "category" ? r.category : i.group_by === "month" ? r.date.slice(0, 7) : shopKey(r.shop) || r.shop.toLowerCase();
    const g = groups.get(key) ?? { key: i.group_by === "shop" ? r.shop : key, spent: 0, payments: 0, refunds: 0, months: new Set<string>() };
    g.spent -= r.share; // a payment is negative, a refund positive and lowers spending
    if (r.amount < 0) g.payments++;
    else g.refunds++;
    g.months.add(r.date.slice(0, 7));
    groups.set(key, g);
  }
  const list = [...groups.values()]
    .map((g) => ({ [i.group_by]: g.key, spent: r2(g.spent), payments: g.payments, refunds: g.refunds, months_with_spending: g.months.size }))
    .sort((a, b) => (i.group_by === "month" ? String(a.month).localeCompare(String(b.month)) : b.spent - a.spent));
  return {
    total_spent: r2(list.reduce((s, g) => s + g.spent, 0)),
    groups: list.slice(0, 60),
    note: list.length > 60 ? `Showing the top 60 of ${list.length} groups; the total covers all.` : undefined,
    rules: "Spending = your share after Tikkie paybacks, minus shop refunds. Transfers, Investing, Paybacks and Income are left out.",
  };
}

async function incomeAndSavings(raw: unknown) {
  const i = Range.parse(raw);
  const rows = await rowsWithShare(i.from, i.to);
  const months = new Map<string, { month: string; came_in: number; spent: number }>();
  for (const r of rows) {
    if (NEITHER.has(r.category)) continue;
    const m = r.date.slice(0, 7);
    const e = months.get(m) ?? { month: m, came_in: 0, spent: 0 };
    if (r.category === "Income" && r.share > 0) e.came_in += r.share;
    else e.spent -= r.share;
    months.set(m, e);
  }
  return {
    months: [...months.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({ month: m.month, came_in: r2(m.came_in), spent: r2(m.spent), saved: r2(m.came_in - m.spent) })),
  };
}

/**
 * Costs that come back every month at a steady amount (subscriptions, insurance,
 * phone, gym, loans), from the last N months of data. Flags price changes and
 * paybacks that stopped.
 */
async function recurringCosts(raw: unknown) {
  const { months = 6 } = RecurringInput.parse(raw ?? {});
  const { data: last } = await db().from("transactions").select("booked_at").order("booked_at", { ascending: false }).limit(1).maybeSingle();
  if (!last) return { items: [], note: "No transactions yet." };
  const end: string = last.booked_at;
  const startMonth = new Date(`${end.slice(0, 7)}-01T00:00:00Z`);
  startMonth.setUTCMonth(startMonth.getUTCMonth() - (months - 1));
  const from = startMonth.toISOString().slice(0, 10);
  const rows = (await rowsWithShare(from, end)).filter((r) => r.amount < 0 && !NEITHER.has(r.category));

  const byShop = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = shopKey(r.shop) || r.shop.toLowerCase();
    byShop.set(k, [...(byShop.get(k) ?? []), r]);
  }
  const minMonths = Math.max(3, Math.ceil(months / 2));
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const items = [...byShop.values()]
    .map((list) => {
      list.sort((a, b) => a.date.localeCompare(b.date));
      const perMonth = new Map<string, typeof list>();
      for (const r of list) perMonth.set(r.date.slice(0, 7), [...(perMonth.get(r.date.slice(0, 7)) ?? []), r]);
      const seen = perMonth.size;
      // Recurring = about one charge a month at a steady amount (one odd month allowed).
      const chargesPerMonth = list.length / seen;
      const amounts = list.map((r) => -r.amount);
      const typical = median(amounts);
      const steady = amounts.filter((a) => Math.abs(a - typical) <= Math.max(1, typical * 0.15)).length;
      if (seen < minMonths || chargesPerMonth > 1.5 || steady < Math.max(3, seen - 1)) return null;

      const lastRow = list.at(-1)!;
      const lastAmount = -lastRow.amount;
      const earlier = amounts.slice(0, -2);
      const before = earlier.length >= 2 ? median(earlier) : null;
      const recent = amounts.slice(-2);
      const priceChange =
        before !== null && recent.every((a) => Math.abs(a - lastAmount) < 0.01) && Math.abs(lastAmount - before) >= Math.max(0.5, before * 0.02)
          ? { from: r2(before), to: r2(lastAmount), since: list.at(-2)!.date.slice(0, 7), extra_per_year: r2((lastAmount - before) * 12) }
          : undefined;
      const paidBackMonths = [...perMonth.entries()].filter(([, rs]) => rs.some((r) => -r.share < -r.amount - 0.01)).map(([m]) => m);
      const odd = list.filter((r) => Math.abs(-r.amount - typical) > Math.max(1, typical * 0.15)).map((r) => ({ date: r.date, amount: r2(-r.amount) }));
      return {
        shop: lastRow.shop,
        category: lastRow.category,
        per_month: r2(typical),
        per_year: r2(typical * 12),
        last_charged: lastRow.date,
        last_amount: r2(lastAmount),
        last_your_share: r2(-lastRow.share),
        months_seen: seen,
        ...(priceChange ? { price_change: priceChange } : {}),
        ...(paidBackMonths.length ? { paid_back_in: paidBackMonths } : {}),
        ...(odd.length ? { unusual_charges: odd } : {}),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.per_month - a.per_month);

  const total = r2(items.reduce((s, i) => s + i.per_month, 0));
  return {
    period: { from, to: end, months },
    total_per_month: total,
    total_per_year: r2(total * 12),
    items,
    not_included:
      "Charges with changing amounts (e.g. Apple, groceries), yearly charges, and anything paid by ING credit card, Klarna or PayPal. Use find_transactions to check those.",
  };
}

async function checkinReports() {
  const { data: checkins } = await db()
    .from("finance_checkins")
    .select("id,month,report,finished_at")
    .eq("agent", "coach")
    .eq("status", "done")
    .order("month", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(12);
  const { data: promises } = await db()
    .from("finance_promises")
    .select("checkin_id,month,text,measure,status,result,evidence")
    .order("created_at", { ascending: false })
    .limit(60);
  const { data: targets } = await db()
    .from("finance_targets")
    .select("monthly_savings,status,reasoning,created_at,decided_at")
    .in("status", ["active", "proposed", "replaced"])
    .order("created_at", { ascending: false })
    .limit(6);
  const seen = new Set<string>();
  return {
    targets: targets ?? [],
    checkins: (checkins ?? [])
      .filter((c) => (seen.has(c.month) ? false : (seen.add(c.month), true))) // latest run per month
      .map((c) => ({
        month: c.month,
        headline: c.report?.headline,
        briefing: c.report?.briefing,
        savings_ideas: c.report?.savings_ideas,
        promises_made: (promises ?? [])
          .filter((p) => p.checkin_id === c.id)
          .map(({ month, text, measure, status, result, evidence }) => ({ for_month: month, text, measure, status, result, evidence })),
      })),
  };
}

async function searchPastChats(raw: unknown, currentChatId: string) {
  const { query } = SearchChatsInput.parse(raw);
  const pattern = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const { data } = await db()
    .from("coach_messages")
    .select("chat_id,role,text,created_at,coach_chats!inner(title,agent)")
    .eq("coach_chats.agent", "coach")
    .neq("chat_id", currentChatId)
    .ilike("text", pattern)
    .order("created_at", { ascending: false })
    .limit(12);
  return {
    results: (data ?? []).map((m) => ({
      chat: (m.coach_chats as unknown as { title: string }).title,
      when: m.created_at.slice(0, 10),
      who: m.role === "user" ? "Houssem" : "you (coach)",
      text: m.text.slice(0, 700),
    })),
  };
}

/* ---------- Definitions sent to the API (stable order, so they cache) ---------- */

const dateProp = (d: string) => ({ type: "string", description: `${d} (YYYY-MM-DD, inclusive)` });
const categoryProp = { type: "string", enum: [...CATEGORIES], description: "Only this category" };
const searchProp = { type: "string", description: "Case-insensitive text to match in the shop name or description, e.g. \"thuisbezorgd\"" };

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "find_transactions",
    description:
      "Look up individual bank transactions (ING current and savings) in a date range, optionally filtered by category, shop/description text and direction. Returns the count and sums of everything that matches plus up to `limit` rows (the largest ones). amount is the raw bank amount (negative = money out); your_share subtracts Tikkie paybacks linked to that payment. Use it for questions about specific shops, payments or 'what was this?'.",
    input_schema: {
      type: "object",
      properties: {
        from: dateProp("First day"),
        to: dateProp("Last day"),
        category: categoryProp,
        search: searchProp,
        direction: { type: "string", enum: ["out", "in", "any"], description: "out = payments, in = money received. Default any." },
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Max rows to return (default 100)" },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "spending_totals",
    description:
      "Total spending in a date range grouped by category, shop or month, computed by LifeOS with the same rules as the monthly check-in (your share after paybacks, refunds subtract, transfers/investing/paybacks/income excluded). Use it for any 'how much did I spend on…' or comparison question instead of adding up transactions yourself.",
    input_schema: {
      type: "object",
      properties: {
        from: dateProp("First day"),
        to: dateProp("Last day"),
        group_by: { type: "string", enum: ["category", "shop", "month"] },
        category: categoryProp,
        search: searchProp,
      },
      required: ["from", "to", "group_by"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "income_and_savings",
    description: "Per month in the range: money that came in (Income category only), spending, and what was saved (came in minus spent).",
    input_schema: {
      type: "object",
      properties: { from: dateProp("First day"), to: dateProp("Last day") },
      required: ["from", "to"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "recurring_costs",
    description:
      "Fixed monthly costs found in the bank data: every shop charged about once a month at a steady amount (subscriptions, insurance, phone, gym, loans), whatever category it's in. Per item: monthly and yearly cost, last charge, price changes, months with a payback, unusual charges. Plus the monthly and yearly total. Use it for any question about subscriptions, fixed costs or recurring payments.",
    input_schema: {
      type: "object",
      properties: { months: { type: "integer", minimum: 3, maximum: 12, description: "How many recent months to scan (default 6)" } },
      additionalProperties: false,
    },
  },
  {
    name: "checkin_reports",
    description:
      "The saved monthly check-in reports (newest first, up to 12): headline, the full briefing you wrote, savings ideas, the promises made and how they were scored, plus his savings targets.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_past_chats",
    description:
      "Search earlier conversations with Houssem (not this one) for a word or phrase. Use it when he refers to something you discussed before.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "A word or short phrase" } },
      required: ["query"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "show_card",
    description:
      "Attach a visual card under your answer. kind: \"ranking\" = horizontal bars, biggest first (categories, shops); \"months\" = a column per month, oldest first, labels as YYYY-MM; \"list\" = rows of label, amount and a short note (fixed costs, specific payments). Every value (and total) must be copied exactly from a lookup result in this turn, or the card is refused. Euros, positive for spending. highlight = the label of the one row your answer is about (it gets the accent colour).",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["ranking", "months", "list"] },
        title: { type: "string", description: "Short sentence-case title, e.g. \"Food delivery per month\"" },
        rows: {
          type: "array",
          minItems: 1,
          maxItems: 24,
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "number" },
              note: { type: "string", description: "Optional, list cards only, max ~6 words, e.g. \"up from € 21,99 in Sep\"" },
            },
            required: ["label", "value"],
            additionalProperties: false,
          },
        },
        highlight: { type: "string" },
        total: {
          type: "object",
          properties: { label: { type: "string" }, value: { type: "number" } },
          required: ["label", "value"],
          additionalProperties: false,
        },
      },
      required: ["kind", "title", "rows"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
];

export const TOOL_LABEL: Record<string, string> = {
  find_transactions: "Looking up transactions",
  spending_totals: "Adding up spending",
  income_and_savings: "Checking income and savings",
  recurring_costs: "Finding your fixed costs",
  checkin_reports: "Reading your check-ins",
  search_past_chats: "Searching earlier chats",
};

/** Run one tool call. Bad input comes back as an error the model can correct. */
export async function runTool(name: string, input: unknown, chatId: string): Promise<{ content: string; isError: boolean }> {
  try {
    const out =
      name === "find_transactions"
        ? await findTransactions(input)
        : name === "spending_totals"
          ? await spendingTotals(input)
          : name === "income_and_savings"
            ? await incomeAndSavings(input)
            : name === "recurring_costs"
              ? await recurringCosts(input)
            : name === "checkin_reports"
              ? (NoInput.parse(input ?? {}), await checkinReports())
              : name === "search_past_chats"
                ? await searchPastChats(input, chatId)
                : null;
    if (out === null) return { content: `Unknown tool ${name}`, isError: true };
    return { content: JSON.stringify(out), isError: false };
  } catch (err) {
    const msg = err instanceof z.ZodError ? `Invalid input: ${err.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` : "The lookup failed.";
    if (!(err instanceof z.ZodError)) console.error(`coach tool ${name}:`, err);
    return { content: msg, isError: true };
  }
}
