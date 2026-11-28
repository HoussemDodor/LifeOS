import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { eur } from "@/lib/format";
import { db } from "@/lib/supabase";
import { ROLE } from "./analyst";
import type { ChatAgent, ChatMessageView, ChatSummary } from "./coach-chat";
import { searchPastChats, TOOLS as COACH_TOOLS } from "./coach-tools";
import { amsterdamYmd } from "./facts";
import { getPortfolio } from "./portfolio";

/**
 * Analyst chat (finance-agents.md, step 5): questions about the portfolio,
 * answered from LifeOS's numbers, the monthly reports and, when the question
 * needs something newer, a web search with a source. It only reads.
 */

const SYSTEM = `${ROLE}

This is the chat: Houssem asks about his investments, you answer.

How to answer:
- Lead with the answer and your view in one bold line, then the 2–4 facts behind it. Usually 60–200 words; longer only when he asks for a breakdown.
- Numbers about his portfolio come from your tools (portfolio_overview, holding_detail): never estimate them. Simple arithmetic on tool results is fine.
- For a company's or fund's situation, start from the latest report (analyst_reports, or the research in holding_detail). Search the web only when he asks about something newer, or the report doesn't cover it. At most 3 searches per answer.
- Every market fact gets its date and a link to where you found it, as a Markdown link: [Reuters, 12 Nov](https://...). Only link pages your own searches returned in this chat.
- Use show_card when 3 or more amounts compare (positions by value, gains per position). Values must be copied exactly from a lookup.
- When he refers to an earlier conversation, check search_past_chats.

Limits:
- You only read. You can't move holdings between core and satellite, approve the core make-up or change anything else; tell him where: the Portfolio tab for the groups, the Analyst tab for the core make-up.
- Never place or suggest placing a specific order (amount, limit price, timing). Talk about direction and size relative to his rules. It's his decision in DEGIRO.
- Spending questions are for the coach: point him to the Coach tab.
- Formatting: paragraphs, "- " bullets, **bold** and links only. No tables or code blocks.`;

/* ---------- Tools (all read-only) ---------- */

const Isin = z.object({ isin: z.string().min(3).max(40) });

async function portfolioOverview() {
  const p = await getPortfolio();
  return {
    worth_eur: Math.round(p.total * 100) / 100,
    put_in_eur: p.result?.putIn ?? null,
    gain_eur: p.result?.gain ?? null,
    trading_costs_eur: p.result?.fees ?? null,
    uninvested_cash_eur: p.cash,
    split_pct: {
      core: Math.round(p.shares.core * 1000) / 10,
      satellite: Math.round(p.shares.satellite * 1000) / 10,
      crypto: Math.round(p.shares.crypto * 1000) / 10,
    },
    rule_checks: p.flags.map((f) => f.text),
    all_world_benchmark: p.benchmark
      ? { fund: p.benchmark.name, same_euros_worth: p.benchmark.value, gain_eur: p.benchmark.gain, gain_pct: p.benchmark.gainPct, price_date: p.benchmark.priceDate }
      : null,
    holdings: p.holdings.map((h) => ({
      isin: h.symbol,
      name: h.name,
      group: h.bucket,
      value_eur: h.valueEur,
      share_pct: Math.round(h.share * 1000) / 10,
      put_in_eur: h.putIn,
      gain_eur: h.gain,
      gain_pct: h.gain !== null && h.putIn ? Math.round((h.gain / h.putIn) * 1000) / 10 : null,
    })),
    prices_as_of: p.asOf,
  };
}

async function latestReport() {
  const { data } = await db()
    .from("finance_checkins")
    .select("month,report,finished_at")
    .eq("agent", "analyst")
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function holdingDetail(raw: unknown) {
  const { isin } = Isin.parse(raw);
  const p = await getPortfolio();
  const h = p.holdings.find((x) => x.symbol.toLowerCase() === isin.toLowerCase());
  const { data: trades } = await db()
    .from("portfolio_trades")
    .select("traded_at,quantity,price,currency,total_eur,fees_eur")
    .eq("isin", h?.symbol ?? isin)
    .order("traded_at");
  const rep = await latestReport();
  const research =
    rep?.report?.research?.stocks?.find((s: { isin: string }) => s.isin === h?.symbol) ??
    rep?.report?.research?.funds?.find((s: { isin: string }) => s.isin === h?.symbol) ??
    null;
  const position = rep?.report?.positions?.find((s: { isin: string }) => s.isin === h?.symbol) ?? null;
  if (!h && !trades?.length) return { error: "No holding with that ISIN. Use portfolio_overview to see the ISINs." };
  return {
    holding: h
      ? { isin: h.symbol, name: h.name, group: h.bucket, value_eur: h.valueEur, put_in_eur: h.putIn, gain_eur: h.gain, share_pct: Math.round(h.share * 1000) / 10 }
      : null,
    buys: (trades ?? []).map((t) => ({
      date: t.traded_at,
      quantity: Number(t.quantity),
      price: t.price === null ? null : Number(t.price),
      currency: t.currency,
      eur: t.total_eur === null ? null : -Number(t.total_eur),
      fee_eur: t.fees_eur === null ? null : -Number(t.fees_eur),
    })),
    last_report: rep ? { month: rep.month, written: rep.finished_at, verdict: position, research } : null,
  };
}

async function analystReports() {
  const { data } = await db()
    .from("finance_checkins")
    .select("month,report,finished_at")
    .eq("agent", "analyst")
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(6);
  const { data: plans } = await db().from("portfolio_core_plan").select("plan,reasoning,status,created_at").in("status", ["proposed", "active"]);
  return {
    core_plan: plans ?? [],
    reports: (data ?? []).map((r, i) => ({
      month: r.month,
      written: r.finished_at,
      headline: r.report?.headline,
      // The newest report in full; older ones in short.
      briefing: i === 0 ? r.report?.briefing : undefined,
      positions: r.report?.positions,
      core: i === 0 ? r.report?.core : undefined,
      new_money: r.report?.new_money,
      watch: r.report?.watch,
    })),
  };
}

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "portfolio_overview",
    description:
      "His whole portfolio now, computed by LifeOS: worth, money put in, gain, trading costs, split vs his 75/25 rules, the rule checks, the all-world benchmark (same euros on the same days) and every holding with ISIN, group, value, share and gain.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "holding_detail",
    description:
      "One holding in depth: his buys (dates, prices, euros, fees), value and gain, and what the latest monthly report said about it (verdict and the research with sources).",
    input_schema: {
      type: "object",
      properties: { isin: { type: "string", description: "ISIN from portfolio_overview, e.g. US30303M1027" } },
      required: ["isin"],
      additionalProperties: false,
    },
  },
  {
    name: "analyst_reports",
    description:
      "Your monthly portfolio reviews, newest first (the newest in full: briefing, core assessment, overlap, verdicts, new money, watch list), plus his core make-up (proposed or approved).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "search_past_chats",
    description: "Search earlier conversations with Houssem about his investments (not this one) for a word or phrase.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "A word or short phrase" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  COACH_TOOLS.find((t) => t.name === "show_card")!,
  { type: "web_search_20260209", name: "web_search", max_uses: 3 },
];

const LABELS: Record<string, string> = {
  portfolio_overview: "Looking at your portfolio",
  holding_detail: "Looking at the position",
  analyst_reports: "Reading your reports",
  search_past_chats: "Searching earlier chats",
};

async function runTool(name: string, input: unknown, chatId: string): Promise<{ content: string; isError: boolean }> {
  try {
    const out =
      name === "portfolio_overview"
        ? await portfolioOverview()
        : name === "holding_detail"
          ? await holdingDetail(input)
          : name === "analyst_reports"
            ? await analystReports()
            : name === "search_past_chats"
              ? await searchPastChats(input, chatId, "analyst")
              : null;
    if (out === null) return { content: `Unknown tool ${name}`, isError: true };
    return { content: JSON.stringify(out), isError: false };
  } catch (err) {
    if (err instanceof z.ZodError) return { content: `Invalid input: ${err.issues.map((i) => i.message).join("; ")}`, isError: true };
    console.error(`analyst tool ${name}:`, err);
    return { content: "The lookup failed.", isError: true };
  }
}

/* ---------- Memory ---------- */

async function buildMemory(): Promise<string> {
  const p = await getPortfolio();
  const lines = [`Today is ${amsterdamYmd(new Date())} (Amsterdam).`];
  if (p.total > 0) {
    lines.push(
      `Portfolio: worth ${eur(p.total)}${p.result ? `, put in ${eur(p.result.putIn)}` : ""}; core ${Math.round(p.shares.core * 100)}%, satellite ${Math.round(p.shares.satellite * 100)}%, crypto ${Math.round(p.shares.crypto * 100)}%. DEGIRO data of ${p.asOf.degiro?.slice(0, 10) ?? "unknown"}; Bitvavo ${p.asOf.bitvavo ? "connected" : "not connected"}.`,
    );
    if (p.benchmark) lines.push(`Same euros in ${p.benchmark.name} would be worth ${eur(p.benchmark.value)} (prices of ${p.benchmark.priceDate}).`);
  } else lines.push("No investments in LifeOS yet.");

  const rep = await latestReport();
  if (rep?.report) {
    lines.push("", `Your latest review (${rep.month}, written ${String(rep.finished_at).slice(0, 10)}): ${rep.report.headline}`);
    for (const x of rep.report.positions ?? []) {
      const name = p.holdings.find((h) => h.symbol === x.isin)?.name ?? x.isin;
      lines.push(`- ${name} (${x.isin}): ${x.verdict}. ${x.one_liner}`);
    }
  } else lines.push("", "There's no monthly review yet.");

  const { data: plan } = await db().from("portfolio_core_plan").select("status,plan").in("status", ["active", "proposed"]).order("created_at", { ascending: false });
  const active = plan?.find((x) => x.status === "active");
  if (active) lines.push("", `His approved core make-up: ${(active.plan as { name: string; share_of_core_pct: number }[]).map((f) => `${f.name} ${f.share_of_core_pct}%`).join(", ")}.`);
  else if (plan?.length) lines.push("", "You proposed a core make-up; he hasn't approved it yet.");

  const { data: chats } = await db().from("coach_chats").select("title,updated_at").eq("agent", "analyst").order("updated_at", { ascending: false }).limit(8);
  if (chats?.length) {
    lines.push("", "Earlier chats (search them with search_past_chats):");
    for (const c of chats) lines.push(`- ${c.updated_at.slice(0, 10)}: ${c.title}`);
  }
  return lines.join("\n");
}

export const ANALYST_CHAT: ChatAgent = {
  agent: "analyst",
  who: "analyst",
  feature: "analyst_chat",
  system: SYSTEM,
  tools: TOOLS,
  labels: LABELS,
  runTool,
  buildMemory,
  links: true,
};

/* ---------- Sample (no database) ---------- */

export const ANALYST_SAMPLE_CHATS: ChatSummary[] = [
  { id: "00000000-0000-4000-8000-0000000000c1", title: "How much of my money is really in Meta?", updatedAt: "2026-11-27T20:05:00Z" },
];
export const ANALYST_SAMPLE_MESSAGES: Record<string, ChatMessageView[]> = {
  "00000000-0000-4000-8000-0000000000c1": [
    { id: "a1", role: "user", text: "How much of my money is really in Meta?" },
    {
      id: "a2",
      role: "assistant",
      text: "**About 13% of your portfolio, more than any other single company.** You hold € 2.224 directly (11,5%), and your S&P 500 fund adds roughly € 296 more, because Meta is 2,42% of that fund.\n\nThat's fine for a high-conviction pick, but it's half your 25% satellite in one name. The next real signal is the Q4 capex guidance: Meta expects $ 225–255 bn of spending in 2027 ([Reuters, 30 Oct](https://www.reuters.com/)).\n\n- Don't add before that call.\n- If you want more Meta exposure, you already get it through the core.",
      cards: [
        {
          kind: "ranking",
          title: "Your largest positions",
          rows: [
            { label: "S&P 500 fund", value: 12249.55 },
            { label: "Meta", value: 2224.15 },
            { label: "SoFi", value: 1930.38 },
            { label: "Amazon", value: 1337.08 },
            { label: "Netflix", value: 812.46 },
          ],
          highlight: "Meta",
        },
      ],
    },
  ],
};
