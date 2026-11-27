import "server-only";
import { db, hasDatabase } from "@/lib/supabase";

/**
 * What LifeOS's Claude calls cost (requirement P11). Anthropic bills in US
 * dollars per million tokens, so this tracks dollars too: the numbers line up
 * with the spend limit in console.anthropic.com.
 */
export type AiFeature = "coach" | "analyst" | "coach_chat" | "analyst_chat";

/** $ per million tokens: input, output, cache read. Cache writes (5-minute) cost 1.25× input. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2 },
};
/** Web search: $10 per 1.000 searches. */
const WEB_SEARCH_USD = 0.01;

export interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

export function costUsd(model: string, u: UsageLike): number {
  // Unknown (e.g. a fallback model we haven't listed): price it like Opus, the safe overestimate.
  const p = PRICES[model] ?? PRICES[Object.keys(PRICES).find((k) => model.startsWith(k)) ?? ""] ?? { input: 5, output: 25, cacheRead: 0.5 };
  const M = 1_000_000;
  return (
    ((u.input_tokens ?? 0) * p.input) / M +
    ((u.output_tokens ?? 0) * p.output) / M +
    ((u.cache_creation_input_tokens ?? 0) * p.input * 1.25) / M +
    ((u.cache_read_input_tokens ?? 0) * p.cacheRead) / M +
    (u.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD
  );
}

/** Log one Claude call. Never throws: a logging hiccup must not break the feature. */
export async function recordUsage(feature: AiFeature, model: string, usage: UsageLike, refId?: string) {
  if (!hasDatabase()) return;
  try {
    await db()
      .from("ai_usage")
      .insert({
        feature,
        model,
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        web_searches: usage.server_tool_use?.web_search_requests ?? 0,
        cost_usd: Math.round(costUsd(model, usage) * 10_000) / 10_000,
        ref_id: refId ?? null,
      });
  } catch (err) {
    console.error("recordUsage:", err);
  }
}

export interface AiUsageMonth {
  costUsd: number;
  capUsd: number | null;
  calls: number;
  tokens: number;
  byFeature: { feature: AiFeature; costUsd: number; calls: number }[];
}

const LABELS: Record<AiFeature, string> = {
  coach: "Spending coach",
  analyst: "Portfolio analyst",
  coach_chat: "Coach chat",
  analyst_chat: "Analyst chat",
};
export const featureLabel = (f: AiFeature) => LABELS[f];

/** This calendar month (UTC, like Anthropic's billing) against the cap in AI_SPEND_CAP_USD. */
export async function getAiUsageMonth(now = new Date()): Promise<AiUsageMonth | null> {
  const capRaw = Number(process.env.AI_SPEND_CAP_USD);
  const capUsd = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : null;
  if (!hasDatabase()) {
    return { costUsd: 0.62, capUsd: capUsd ?? 10, calls: 2, tokens: 61_000, byFeature: [{ feature: "coach", costUsd: 0.62, calls: 2 }] };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data, error } = await db()
    .from("ai_usage")
    .select("feature,cost_usd,input_tokens,output_tokens,cache_creation_input_tokens,cache_read_input_tokens")
    .gte("created_at", start);
  if (error) return null;
  const by = new Map<AiFeature, { costUsd: number; calls: number }>();
  let cost = 0;
  let tokens = 0;
  for (const r of data) {
    const c = Number(r.cost_usd);
    cost += c;
    tokens += r.input_tokens + r.output_tokens + r.cache_creation_input_tokens + r.cache_read_input_tokens;
    const e = by.get(r.feature) ?? { costUsd: 0, calls: 0 };
    by.set(r.feature, { costUsd: e.costUsd + c, calls: e.calls + 1 });
  }
  return {
    costUsd: cost,
    capUsd,
    calls: data.length,
    tokens,
    byFeature: [...by].map(([feature, v]) => ({ feature, ...v })).sort((a, b) => b.costUsd - a.costUsd),
  };
}
