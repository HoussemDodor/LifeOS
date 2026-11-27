import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { recordUsage } from "@/lib/ai-usage";
import { db } from "@/lib/supabase";
import type { AnalystFacts } from "./analyst-facts";
import { COACH_MODEL } from "./coach";

/**
 * Portfolio analyst (finance-agents.md, step 4b). A workflow, not a free agent:
 *   1. research every satellite stock, and every core fund we have no fresh
 *      facts for, in parallel, each with web search and a source per claim;
 *   2. one final call (no web) writes the report from LifeOS's numbers plus
 *      that research, in a fixed structure.
 * LifeOS never trades; the report is analysis against Houssem's own rules.
 */

const MODEL = COACH_MODEL;
const FUND_FACTS_DAYS = 90;
/** Research must finish within this, so the report call still fits in the 5-minute server limit. */
const RESEARCH_BUDGET_MS = 150_000;

/* ---------- Shapes ---------- */

const Source = z.object({ title: z.string(), url: z.string(), date: z.string() });
type SourceT = z.infer<typeof Source>;

const FundResearch = z.object({
  index_tracked: z.string(),
  ter_pct: z.number().nullable(),
  holdings_count: z.number().nullable(),
  distribution: z.enum(["distributing", "accumulating", "unknown"]),
  top_holdings: z.array(z.object({ name: z.string(), weight_pct: z.number() })).max(15),
  regions: z.array(z.object({ region: z.string(), weight_pct: z.number() })).max(10),
  top_sectors: z.array(z.object({ sector: z.string(), weight_pct: z.number() })).max(8),
  as_of: z.string(),
  notes: z.string(),
  sources: z.array(Source).max(8),
});
export type FundResearchT = z.infer<typeof FundResearch>;

const Finding = z.object({ text: z.string(), date: z.string(), source_url: z.string() });
const StockResearch = z.object({
  business: z.string(),
  latest_results: Finding,
  valuation: Finding,
  news: z.array(Finding).max(5),
  thesis_check: z.string(),
  risks: z.array(z.string()).max(5),
  verdict: z.enum(["hold", "add", "trim"]),
  verdict_reason: z.string(),
  sources: z.array(Source).max(10),
});
export type StockResearchT = z.infer<typeof StockResearch>;

export const ReportSchema = z.object({
  headline: z.string(),
  briefing: z.string(),
  core: z.object({
    assessment: z.string(),
    overlap: z.array(z.object({ stock: z.string(), fund: z.string(), weight_pct: z.number() })),
    currency_note: z.string(),
    plan: z.object({
      kind: z.enum(["propose", "keep", "none"]),
      funds: z.array(z.object({ name: z.string(), isin: z.string(), share_of_core_pct: z.number(), why: z.string() })),
      reasoning: z.string(),
    }),
  }),
  positions: z.array(
    z.object({ isin: z.string(), verdict: z.enum(["hold", "add", "trim"]), one_liner: z.string(), size_note: z.string() }),
  ),
  new_money: z.string(),
  watch: z.array(z.string()),
});
export type AnalystReport = z.infer<typeof ReportSchema> & {
  research: { funds: (FundResearchT & { isin: string; name: string; cached: boolean })[]; stocks: (StockResearchT & { isin: string; name: string })[] };
  failed: string[];
};

/* ---------- JSON schemas for the API ---------- */

const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: "string" };
const num = { type: "number" };
const numOrNull = { type: ["number", "null"] };
const arr = (items: unknown) => ({ type: "array", items });
const sourceJson = obj({ title: str, url: str, date: { type: "string", description: "Publication date (YYYY-MM-DD), or the date you read it" } });
const findingJson = obj({ text: str, date: str, source_url: { type: "string", description: "A URL from your search results" } });

const FUND_TOOL: Anthropic.Beta.BetaTool = {
  name: "submit_fund",
  description: "Hand in the fund facts you found. Call it exactly once, at the end.",
  input_schema: obj({
    index_tracked: str,
    ter_pct: numOrNull,
    holdings_count: numOrNull,
    distribution: { type: "string", enum: ["distributing", "accumulating", "unknown"] },
    top_holdings: arr(obj({ name: str, weight_pct: num })),
    regions: arr(obj({ region: str, weight_pct: num })),
    top_sectors: arr(obj({ sector: str, weight_pct: num })),
    as_of: { type: "string", description: "Date of the fund data (YYYY-MM-DD)" },
    notes: str,
    sources: arr(sourceJson),
  }) as Anthropic.Beta.BetaTool["input_schema"],
};

const STOCK_TOOL: Anthropic.Beta.BetaTool = {
  name: "submit_research",
  description: "Hand in your research on the stock. Call it exactly once, at the end.",
  input_schema: obj({
    business: { type: "string", description: "What the company does, one sentence" },
    latest_results: findingJson,
    valuation: findingJson,
    news: arr(findingJson),
    thesis_check: { type: "string", description: "2–4 sentences: does the case for owning it still hold? Include the bear case." },
    risks: arr(str),
    verdict: { type: "string", enum: ["hold", "add", "trim"] },
    verdict_reason: str,
    sources: arr(sourceJson),
  }) as Anthropic.Beta.BetaTool["input_schema"],
};

const REPORT_JSON = obj({
  headline: str,
  briefing: str,
  core: obj({
    assessment: str,
    overlap: arr(obj({ stock: str, fund: str, weight_pct: num })),
    currency_note: str,
    plan: obj({
      kind: { type: "string", enum: ["propose", "keep", "none"] },
      funds: arr(obj({ name: str, isin: str, share_of_core_pct: num, why: str })),
      reasoning: str,
    }),
  }),
  positions: arr(obj({ isin: str, verdict: { type: "string", enum: ["hold", "add", "trim"] }, one_liner: str, size_note: str })),
  new_money: str,
  watch: arr(str),
});

/* ---------- Instructions ---------- */

const ROLE = `You are the portfolio analyst inside LifeOS, Houssem's personal dashboard.

Houssem invests for the long term (10+ years) and buys more when prices dip. His own rules (core–satellite):
- Core, 75% of the portfolio: broad, boring index funds. No stock opinions here: only the mix, costs, overlap and currency exposure matter.
- Satellite, 25%: individual stocks and crypto. Here you give full, critical opinions per position.
- Crypto: at most 5% of the whole portfolio.
- Drift: let winners run. Only when the satellite is above 50% of the portfolio does his rule say to trim back toward 25%.
- His benchmark is a global all-world index fund.

LifeOS never trades: every buy or sell is his own decision in DEGIRO. What you write is analysis against his own rules, not licensed financial advice. Be direct and specific anyway: dated facts, real numbers, a clear opinion with the reason. Sober, no hype. Write in English; money the Dutch way (€ 1.234,56), percentages with a decimal comma (12,5%).`;

const STOCK_SYSTEM = `${ROLE}

Your job now: research one satellite stock for this month's review, then call submit_research.
- Search for the latest quarterly results (period, revenue and growth, margins or profit, guidance), the current valuation (e.g. forward P/E or EV/sales, compared with its own history or peers), and the 2–4 news items of the last three months that matter most for owning it.
- Be critical. Look for the bear case as hard as the bull case. A falling price is not a thesis; say whether the business case still holds.
- Every finding needs a source URL taken from your search results and a date. Never invent a number, date or URL. If you can't find something, say so in the text.
- Verdict: "hold", "add" or "trim", judged for a long-term investor with his rules. "Add" only if the case is intact and the position isn't already large. "Trim" if the case is broken or the position is far too big.`;

const FUND_SYSTEM = `${ROLE}

Your job now: collect the facts of one index fund, then call submit_fund.
- Prefer the issuer's own fund page (Vanguard, iShares, Xtrackers…) or justETF. Find: the index it tracks, TER, number of holdings, distributing or accumulating, the top 10 holdings with weights, the region split and the top sectors, with the date of that data.
- Never invent numbers. Use null or "unknown" for what you can't find. Every source must be a URL from your search results.`;

const REPORT_SYSTEM = `${ROLE}

Your job now: write this month's portfolio review. You get LifeOS's numbers (computed in code, use them as-is) and research per position and per fund (found by web search, each claim with a source). Don't add facts that are in neither.

What to return (the schema enforces the shape):
- headline: one line, max ~12 words, the most important thing this month.
- briefing: Markdown, 300–500 words, "## " headings, "- " bullets, **bold** for key numbers. Suggested flow: the verdict (worth, gain, split vs 75/25, the rule checks) · core · satellite, biggest issues first · where new money should go · what to watch. Say which positions are dips worth buying (his style) and which have a broken case; don't treat every dip as a chance.
- core.assessment: is the core really "broad and boring" and global like his benchmark? Costs (TER), concentration, what's missing.
- core.overlap: every satellite stock that also sits in a core fund's top holdings, with its weight in that fund (from the fund research). Empty if none.
- core.currency_note: how much of the portfolio depends on the US dollar or one market, in one or two sentences.
- core.plan: if core_plan in the facts is null or only proposed, propose a core make-up (kind "propose"): 1–3 broad funds with their share of the core in % (adding up to 100) and why. Name funds that are easy to buy at DEGIRO, with ISIN if you know it from the research, otherwise "". If he has an active plan that still fits, kind "keep" and repeat it. Use "none" only if there's nothing to say.
- positions: one entry per satellite holding (use its ISIN from the facts), verdict hold/add/trim (you may change the research verdict if the bigger picture says so), a one_liner with the reason, and size_note about its weight in the portfolio.
- new_money: where the next euros should go to move toward 75/25 without selling, concretely.
- watch: 2–4 things to check next month (an earnings date, a price level, a rule).`;

/* ---------- Helpers ---------- */

const URL_RE = /https?:\/\/[^\s"'<>\\)\]]+/g;
const normUrl = (u: string) => u.replace(/[.,;]+$/, "").replace(/\/$/, "").toLowerCase();

/** Keep only sources and findings whose URL came out of this call's own web searches. */
function onlyFound<T extends { sources: SourceT[] }>(data: T, seen: Set<string>, findingKeys: (keyof T)[] = []): T {
  const ok = (u: string) => seen.has(normUrl(u));
  const out = { ...data, sources: data.sources.filter((s) => ok(s.url)) } as T;
  for (const k of findingKeys) {
    const v = out[k] as unknown;
    if (Array.isArray(v)) (out[k] as unknown) = v.filter((f: { source_url: string }) => ok(f.source_url));
    else if (v && typeof v === "object" && "source_url" in v) {
      const f = v as { source_url: string; text: string };
      if (!ok(f.source_url)) (out[k] as unknown) = { ...f, source_url: "", text: `${f.text} (no source found)` };
    }
  }
  return out;
}

/** One research call: web search until the model hands its findings to the submit tool. */
async function research<T>(
  client: Anthropic,
  refId: string,
  system: string,
  prompt: string,
  tool: Anthropic.Beta.BetaTool,
  schema: z.ZodType<T>,
  maxSearches: number,
  deadline: number,
): Promise<{ data: T; seen: Set<string> }> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  const seen = new Set<string>();
  for (let step = 0; step < 6; step++) {
    const msg = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxSearches }, tool],
        messages,
      }, { signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())) })
      .finalMessage();
    await recordUsage("analyst", msg.model, msg.usage, refId);
    if (msg.stop_reason === "refusal") throw new Error("declined");

    // Every URL the searches returned (results, citations, filtered output).
    for (const b of msg.content) if (b.type !== "tool_use") for (const u of JSON.stringify(b).match(URL_RE) ?? []) seen.add(normUrl(u));

    const call = msg.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === tool.name);
    messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
    if (call) {
      const parsed = schema.safeParse(call.input);
      if (parsed.success) return { data: parsed.data, seen };
      messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Invalid: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}. Call ${tool.name} again.` }],
      });
      continue;
    }
    if (msg.stop_reason === "pause_turn") continue; // the server resumes its search loop
    if (msg.stop_reason === "max_tokens") throw new Error("cut off");
    messages.push({ role: "user", content: `Now call ${tool.name} with what you found.` });
  }
  throw new Error("no answer");
}

const fmtBuys = (b: AnalystFacts["holdings"][number]["buys"]) =>
  b.map((t) => `${t.date}: ${t.quantity} at ${t.price ?? "?"} ${t.currency ?? ""} (€ ${t.eur ?? "?"})`).join("; ");

/* ---------- The run ---------- */

export async function runAnalyst(checkinId: string, facts: AnalystFacts): Promise<void> {
  try {
    const client = new Anthropic();
    const deadline = Date.now() + RESEARCH_BUDGET_MS;
    const stocks = facts.holdings.filter((h) => h.group === "satellite");
    const funds = facts.holdings.filter((h) => h.group === "core");

    // Fund facts we already have and that are recent enough.
    const { data: cached } = await db()
      .from("instrument_facts")
      .select("isin,name,facts,fetched_at")
      .in("isin", funds.length ? funds.map((f) => f.isin) : ["-"]);
    const fresh = new Map(
      (cached ?? [])
        .filter((c) => Date.now() - Date.parse(c.fetched_at) < FUND_FACTS_DAYS * 86_400_000)
        .map((c) => [c.isin, c.facts as FundResearchT]),
    );

    const failed: string[] = [];
    const [fundResults, stockResults] = await Promise.all([
      Promise.all(
        funds.map(async (f) => {
          if (fresh.has(f.isin)) return { ...fresh.get(f.isin)!, isin: f.isin, name: f.name, cached: true };
          try {
            const { data, seen } = await research(
              client,
              checkinId,
              FUND_SYSTEM,
              `Fund: ${f.name} (ISIN ${f.isin}). Today is ${facts.today}. Use at most 4 searches.`,
              FUND_TOOL,
              FundResearch,
              4,
              deadline,
            );
            const clean = onlyFound(data, seen);
            await db().from("instrument_facts").upsert({ isin: f.isin, name: f.name, facts: clean, sources: clean.sources, fetched_at: new Date().toISOString() });
            return { ...clean, isin: f.isin, name: f.name, cached: false };
          } catch (err) {
            console.error(`analyst fund ${f.isin}:`, err);
            failed.push(f.name);
            return null;
          }
        }),
      ),
      Promise.all(
        stocks.map(async (s) => {
          try {
            const { data, seen } = await research(
              client,
              checkinId,
              STOCK_SYSTEM,
              [
                `Stock: ${s.name} (ISIN ${s.isin}). Today is ${facts.today}.`,
                `His position: worth € ${s.value_eur} (${s.share_of_portfolio_pct}% of his portfolio), put in € ${s.put_in_eur ?? "?"}, gain ${s.gain_pct ?? "?"}%.`,
                `His buys: ${fmtBuys(s.buys) || "unknown"}.`,
                `Use at most 5 searches.`,
              ].join("\n"),
              STOCK_TOOL,
              StockResearch,
              5,
              deadline,
            );
            return { ...onlyFound(data, seen, ["latest_results", "valuation", "news"]), isin: s.isin, name: s.name };
          } catch (err) {
            console.error(`analyst stock ${s.isin}:`, err);
            failed.push(s.name);
            return null;
          }
        }),
      ),
    ]);
    const fundsDone = fundResults.filter((x) => x !== null);
    const stocksDone = stockResults.filter((x) => x !== null);
    if (stocks.length + funds.length > 0 && fundsDone.length + stocksDone.length === 0) {
      throw new Error("The research step failed for every holding. Try again later.");
    }

    // The report itself: LifeOS's numbers + the research, no web.
    const msg = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: { type: "json_schema", schema: REPORT_JSON } },
        system: [{ type: "text", text: REPORT_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: [
              `LifeOS's numbers:\n${JSON.stringify(facts)}`,
              `Fund research:\n${JSON.stringify(fundsDone)}`,
              `Stock research:\n${JSON.stringify(stocksDone)}`,
              failed.length ? `Research failed for: ${failed.join(", ")}. Say so where it matters.` : "",
            ].join("\n\n"),
          },
        ],
      })
      .finalMessage();
    await recordUsage("analyst", msg.model, msg.usage, checkinId);
    if (msg.stop_reason === "refusal") throw new Error("The model declined this request.");
    if (msg.stop_reason === "max_tokens") throw new Error("The report was cut off (max_tokens).");
    const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = ReportSchema.parse(JSON.parse(text));

    const report: AnalystReport = { ...parsed, research: { funds: fundsDone, stocks: stocksDone }, failed };

    if (parsed.core.plan.kind === "propose" && parsed.core.plan.funds.length) {
      await db().from("portfolio_core_plan").update({ status: "declined" }).eq("status", "proposed");
      await db().from("portfolio_core_plan").insert({
        plan: parsed.core.plan.funds,
        reasoning: parsed.core.plan.reasoning,
        status: "proposed",
        checkin_id: checkinId,
      });
    }
    await db()
      .from("finance_checkins")
      .update({ status: "done", report, model: msg.model, usage: msg.usage, finished_at: new Date().toISOString() })
      .eq("id", checkinId);
  } catch (err) {
    console.error("runAnalyst:", err);
    const msg =
      err instanceof Anthropic.AuthenticationError
        ? "The Anthropic API key was rejected."
        : err instanceof Anthropic.RateLimitError
          ? "Anthropic is rate-limiting right now. Try again in a minute."
          : err instanceof Anthropic.APIError
            ? `Anthropic returned an error (${err.status}).`
            : err instanceof z.ZodError || err instanceof SyntaxError
              ? "The analyst's report didn't have the expected shape."
              : err instanceof Error
                ? err.message
                : "Unknown error";
    await db().from("finance_checkins").update({ status: "failed", error: msg, finished_at: new Date().toISOString() }).eq("id", checkinId);
  }
}
