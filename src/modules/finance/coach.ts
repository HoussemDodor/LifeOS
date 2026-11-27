import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { recordUsage } from "@/lib/ai-usage";
import { db } from "@/lib/supabase";
import { addMonths, type CheckinFacts } from "./facts";
import { CATEGORIES } from "./ing-csv";

export const COACH_MODEL = "claude-opus-5-5";
export const hasAnthropic = () => Boolean(process.env.ANTHROPIC_API_KEY);

const FIXABLE = CATEGORIES.filter((c) => c !== "Paybacks");

/* ---------- The report's shape (enforced by the API, validated again here) ---------- */

export const ReportSchema = z.object({
  headline: z.string(),
  briefing: z.string(),
  savings_ideas: z.array(z.object({ idea: z.string(), eur_per_year: z.number() })),
  target: z.object({
    kind: z.enum(["propose", "keep", "none"]),
    monthly_savings_eur: z.number(),
    reasoning: z.string(),
  }),
  promise_scores: z.array(
    z.object({ promise_id: z.string(), result: z.enum(["hit", "partly", "missed"]), evidence: z.string() }),
  ),
  new_promises: z.array(z.object({ text: z.string(), measure: z.string() })),
  recategorize: z.array(z.object({ transaction_id: z.string(), category: z.enum(FIXABLE), reason: z.string() })),
});
export type CoachReport = z.infer<typeof ReportSchema>;

const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const str = { type: "string" };
const SCHEMA = obj({
  headline: str,
  briefing: str,
  savings_ideas: { type: "array", items: obj({ idea: str, eur_per_year: { type: "number" } }) },
  target: obj({
    kind: { type: "string", enum: ["propose", "keep", "none"] },
    monthly_savings_eur: { type: "number" },
    reasoning: str,
  }),
  promise_scores: {
    type: "array",
    items: obj({ promise_id: str, result: { type: "string", enum: ["hit", "partly", "missed"] }, evidence: str }),
  },
  new_promises: { type: "array", items: obj({ text: str, measure: str }) },
  recategorize: {
    type: "array",
    items: obj({ transaction_id: str, category: { type: "string", enum: FIXABLE }, reason: str }),
  },
});

/* ---------- The coach's instructions (stable, so they cache) ---------- */

const SYSTEM = `You are the spending coach inside LifeOS, Houssem's personal dashboard. Once a month you review his spending and write him a briefing.

Voice: Gen Z but blunt and specific. Talk to him directly ("you"). Casual, a bit of slang is fine, a joke is fine, but never cringe, never preachy, no emoji spam (two at most). Every claim comes with a real number, a real shop, or both: "14 Thuisbezorgd orders, € 212" beats "you eat out a lot". Call out what went well too, briefly. Write in English, but format money the Dutch way: € 1.234,56 (or € 1.234 for round amounts).

Hard rules:
- Use only the numbers in the data you get. LifeOS computed them; don't recompute totals or invent figures. Simple arithmetic on them (a difference, × 12 for a yearly figure) is fine.
- "your_share" already subtracts Tikkie paybacks. Transfers between his own accounts, investing and paybacks are not spending or income; never treat moving money to savings or DEGIRO as spending. Only the Income category is money in; other positive amounts are refunds and already lower that category's spending.
- Some payments hide what was bought: an "ING creditcard" collection is a monthly lump sum of card spending, and Klarna, PayPal or Mollie payments hide the shop. When they're big, say what they add up to and that the detail is invisible to you; don't guess what's in them.
- Payments to people (by name, or "via Tikkie") can be shared costs, gifts or family support. Don't moralise about them; mention them only as a total if they're significant.
- If data_complete is false, say once, early and plainly, that the month's data stops at data_until and the numbers may be low.
- This is about spending habits, not investment advice.

What to return (the schema enforces the shape):
- headline: one punchy line (max ~12 words) that sums up the month.
- briefing: Markdown, 250–450 words. Use "## " headings and "- " bullets; **bold** for key numbers. Suggested flow: the verdict (spent, came in, saved, vs his 12-month average) · where the money went (biggest categories and shops, what grew vs average) · recurring costs and subscriptions worth a second look · his target and last month's promises (if any) · one closing line.
- savings_ideas: 2–5 concrete ideas, each with a realistic yearly € amount you can defend from the data. Don't repeat last month's ideas unless he clearly didn't act on them (then say so).
- target: if "target" in the data is null, propose a realistic monthly savings target from his 12-month history (kind "propose", the amount, and 1–2 sentences of reasoning). If he has a target, use kind "keep" with the same amount, and in the briefing say whether he hit it using target.hit and target.saved_this_month; only propose a new amount (kind "propose") if the current one is clearly unrealistic. Use kind "none" with 0 only if there's too little data to say anything.
- promise_scores: one entry per item in promises_to_score, using its exact id. Judge it from the review month's data and give the evidence in numbers ("11 orders vs 14 last month").
- new_promises: 1 to 3 small, concrete actions for next month that can be measured from his bank data (a count or a € amount at a shop or in a category). "measure" says exactly how the next check-in will judge it.
- recategorize: fix review-month transactions whose category is "Other" or clearly wrong. Only use ids from review_month.transactions, never ones with locked: true, and only when you're confident. Leave Transfers, Paybacks and Income alone unless they're obviously wrong. An empty list is fine.`;

/* ---------- Running a check-in ---------- */

export async function runCoach(checkinId: string, facts: CheckinFacts): Promise<void> {
  try {
    const client = new Anthropic();
    const message = await client.beta.messages
      .stream({
        model: COACH_MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: `Here is the data for the ${facts.month} check-in, as JSON:\n\n${JSON.stringify(facts)}`,
          },
        ],
      })
      .finalMessage();
    // Log the cost first, so it's counted even if the answer turns out unusable.
    await recordUsage("coach", message.model, message.usage, checkinId);

    if (message.stop_reason === "refusal") throw new Error("The model declined this request.");
    if (message.stop_reason === "max_tokens") throw new Error("The report was cut off (max_tokens).");
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const report = ReportSchema.parse(JSON.parse(text));

    await applyReport(checkinId, facts, report);
    await db()
      .from("finance_checkins")
      .update({
        status: "done",
        report,
        model: message.model,
        usage: message.usage,
        finished_at: new Date().toISOString(),
      })
      .eq("id", checkinId);
  } catch (err) {
    console.error("runCoach:", err);
    const msg =
      err instanceof Anthropic.AuthenticationError
        ? "The Anthropic API key was rejected."
        : err instanceof Anthropic.RateLimitError
          ? "Anthropic is rate-limiting right now. Try again in a minute."
          : err instanceof Anthropic.APIError
            ? `Anthropic returned an error (${err.status}).`
            : err instanceof z.ZodError || err instanceof SyntaxError
              ? "The coach's answer didn't have the expected shape."
              : err instanceof Error
                ? err.message
                : "Unknown error";
    await db()
      .from("finance_checkins")
      .update({ status: "failed", error: msg, finished_at: new Date().toISOString() })
      .eq("id", checkinId);
  }
}

/** Save what the report decided: promise scores, new promises, a target proposal, category fixes. */
async function applyReport(checkinId: string, facts: CheckinFacts, report: CoachReport) {
  const toScore = new Set(facts.promises_to_score.map((p) => p.id));
  for (const s of report.promise_scores) {
    if (!toScore.has(s.promise_id)) continue;
    await db()
      .from("finance_promises")
      .update({ result: s.result, evidence: s.evidence, scored_in: checkinId })
      .eq("id", s.promise_id);
  }

  const fresh = report.new_promises.slice(0, 3);
  if (fresh.length) {
    await db()
      .from("finance_promises")
      .insert(fresh.map((p) => ({ checkin_id: checkinId, month: addMonths(facts.month, 1), text: p.text, measure: p.measure })));
  }

  if (report.target.kind === "propose" && report.target.monthly_savings_eur > 0) {
    await db().from("finance_targets").update({ status: "declined" }).eq("status", "proposed");
    await db().from("finance_targets").insert({
      monthly_savings: Math.round(report.target.monthly_savings_eur * 100) / 100,
      status: "proposed",
      reasoning: report.target.reasoning,
      checkin_id: checkinId,
    });
  }

  // Category fixes: only this month's unlocked transactions, and only real changes.
  const allowed = new Map(facts.review_month.transactions.filter((t) => !t.locked).map((t) => [t.id, t.category]));
  for (const c of report.recategorize) {
    const from = allowed.get(c.transaction_id);
    if (from === undefined || from === c.category) continue;
    const { error } = await db()
      .from("transactions")
      .update({ category: c.category, category_source: "agent" })
      .eq("id", c.transaction_id)
      .neq("category_source", "manual");
    if (error) continue;
    await db().from("finance_agent_changes").insert({
      checkin_id: checkinId,
      transaction_id: c.transaction_id,
      from_category: from,
      to_category: c.category,
      reason: c.reason,
    });
  }
}
