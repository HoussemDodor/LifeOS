import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAiUsageMonth, recordUsage } from "@/lib/ai-usage";
import { eur } from "@/lib/format";
import { db, hasDatabase } from "@/lib/supabase";
import { COACH_MODEL } from "./coach";
import { amsterdamYmd } from "./facts";
import { runTool, TOOL_LABEL, TOOLS } from "./coach-tools";

/**
 * Coach chat (finance-agents.md, step 3): Houssem asks, the coach answers from
 * his own data through read-only tools. Each chat is saved; a new chat starts
 * with a short memory of the check-ins and earlier chats, and the coach can
 * search older chats when he refers to them.
 */

type Param = Anthropic.Beta.BetaMessageParam;
export type ChatEvent =
  | { type: "chat"; id: string }
  | { type: "text"; text: string }
  | { type: "tool"; label: string }
  | { type: "done" }
  | { type: "error"; message: string };

const MAX_STEPS = 8;

const SYSTEM = `You are the spending coach inside LifeOS, Houssem's personal dashboard. This is the chat: he asks about his money and spending, you answer from his own data.

Voice: the same as in your monthly check-ins. Gen Z but blunt and specific, talk to him as "you". Casual is fine, cringe is not; at most one emoji. Lead with the answer, then the numbers behind it. Keep it short: usually 40–180 words. Go longer only when he asks for a breakdown.

How to answer:
- Look things up with your tools before you state a number. Never guess or make up amounts, dates or shops. If the tools don't have it, say so.
- Use spending_totals or income_and_savings for totals and comparisons; don't add up rows from find_transactions yourself. Simple arithmetic on tool results (a difference, × 12) is fine.
- Dates: the chat memory below gives today's date and what period the data covers. "Last month" means the previous calendar month. If a month isn't complete in the data, say the numbers may be low.
- Money the Dutch way: € 1.234,56 (or € 1.234 for round amounts). Write in English.
- Spending rules (LifeOS applies them in the tools): your share is after Tikkie paybacks; transfers between his accounts, investing and paybacks are not spending; only the Income category is income; shop refunds lower spending. An "ING creditcard" collection is a lump sum of card spending, and Klarna/PayPal/Mollie hide the shop: say the detail is invisible rather than guessing what's inside.
- Payments to people can be shared costs, gifts or family support. Don't moralise about them.
- When he mentions something from before, check search_past_chats or checkin_reports.

Limits:
- You can only read. You can't change his savings target, promises, categories or transactions. If he asks, tell him where to do it himself: the target and promises on the Monthly check-in page, categories on the Finance page.
- Investments and crypto are for the portfolio analyst, not you. You can say how much moved to DEGIRO or Bitvavo (the Investing category), but don't give investment advice.
- Formatting: plain paragraphs, "- " bullets and **bold** only. No tables, no links, no code blocks.`;

/* ---------- Reading chats ---------- */

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: string;
}
export interface ChatMessageView {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export async function listChats(): Promise<ChatSummary[]> {
  if (!hasDatabase()) return SAMPLE_CHATS;
  const { data } = await db()
    .from("coach_chats")
    .select("id,title,updated_at")
    .eq("agent", "coach")
    .order("updated_at", { ascending: false })
    .limit(30);
  return (data ?? []).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }));
}

export async function getChatMessages(chatId: string): Promise<ChatMessageView[]> {
  if (!hasDatabase()) return chatId === SAMPLE_CHATS[0].id ? SAMPLE_MESSAGES : [];
  const { data } = await db()
    .from("coach_messages")
    .select("id,role,text")
    .eq("chat_id", chatId)
    .order("created_at")
    .order("id");
  return (data ?? []) as ChatMessageView[];
}

/* ---------- Memory: what the coach knows when a chat starts ---------- */

async function buildMemory(): Promise<string> {
  const today = amsterdamYmd(new Date());
  const lines = [`Today is ${today} (Amsterdam).`];

  const [first, last] = await Promise.all([
    db().from("transactions").select("booked_at").order("booked_at").limit(1).maybeSingle(),
    db().from("transactions").select("booked_at").order("booked_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  lines.push(
    first.data && last.data
      ? `His bank data runs from ${first.data.booked_at} to ${last.data.booked_at}.`
      : "There are no bank transactions yet.",
  );

  const { data: target } = await db()
    .from("finance_targets")
    .select("monthly_savings,status")
    .in("status", ["active", "proposed"])
    .order("created_at", { ascending: false });
  const active = target?.find((t) => t.status === "active");
  const proposed = target?.find((t) => t.status === "proposed");
  if (active) lines.push(`His savings target: ${eur(Number(active.monthly_savings))} a month.`);
  else if (proposed) lines.push(`You proposed a savings target of ${eur(Number(proposed.monthly_savings))} a month; he hasn't decided yet.`);
  else lines.push("He has no savings target yet.");

  const { data: checkins } = await db()
    .from("finance_checkins")
    .select("month,report")
    .eq("agent", "coach")
    .eq("status", "done")
    .order("month", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(6);
  const seen = new Set<string>();
  const latest = (checkins ?? []).filter((c) => (seen.has(c.month) ? false : (seen.add(c.month), true))).slice(0, 3);
  if (latest.length) {
    lines.push("", "Recent check-ins (full reports via checkin_reports):");
    for (const c of latest) lines.push(`- ${c.month}: ${c.report?.headline ?? ""}`);
  }

  const { data: promises } = await db()
    .from("finance_promises")
    .select("month,text,result")
    .eq("status", "accepted")
    .order("created_at", { ascending: false })
    .limit(6);
  if (promises?.length) {
    lines.push("", "Promises he accepted:");
    for (const p of promises) lines.push(`- For ${p.month}: ${p.text}${p.result ? ` (scored: ${p.result})` : " (not scored yet)"}`);
  }

  const { data: chats } = await db()
    .from("coach_chats")
    .select("title,updated_at")
    .eq("agent", "coach")
    .order("updated_at", { ascending: false })
    .limit(8);
  if (chats?.length) {
    lines.push("", "Earlier chats (search them with search_past_chats):");
    for (const c of chats) lines.push(`- ${c.updated_at.slice(0, 10)}: ${c.title}`);
  }
  return lines.join("\n");
}

/* ---------- One turn ---------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const titleFrom = (q: string) => {
  const t = q.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57).trimEnd()}…` : t;
};

/** Checks before a turn: returns an error message, or null when the chat may run. */
export async function chatBlocked(): Promise<string | null> {
  if (!hasDatabase()) return "Sample mode: connect Supabase to chat with the coach.";
  if (!process.env.ANTHROPIC_API_KEY) return "Add the Anthropic API key first (see the check-in page).";
  const usage = await getAiUsageMonth();
  if (usage?.capUsd && usage.costUsd >= usage.capUsd) {
    return `This month's AI budget (US$ ${usage.capUsd}) is used up. The chat is back on the 1st.`;
  }
  return null;
}

/**
 * Answer one question. Emits events as it goes (text as it streams, a label
 * per lookup) and saves both sides of the turn. Never throws.
 */
export async function runChatTurn(chatIdIn: string | null, question: string, emit: (e: ChatEvent) => void): Promise<void> {
  let chatId = chatIdIn && UUID.test(chatIdIn) ? chatIdIn : null;
  let memory = "";
  try {
    if (chatId) {
      const { data } = await db().from("coach_chats").select("memory").eq("id", chatId).eq("agent", "coach").maybeSingle();
      if (!data) chatId = null;
      else memory = data.memory;
    }
    if (!chatId) {
      memory = await buildMemory();
      const { data, error } = await db().from("coach_chats").insert({ title: titleFrom(question), memory }).select("id").single();
      if (error) throw error;
      chatId = data.id as string;
    }
    emit({ type: "chat", id: chatId });

    // Replay the chat exactly as the API saw it (tool calls and thinking included).
    const { data: past } = await db().from("coach_messages").select("api").eq("chat_id", chatId).order("created_at").order("id");
    const history: Param[] = (past ?? []).flatMap((m) => m.api as Param[]);
    const userTurn: Param = { role: "user", content: question };
    await db().from("coach_messages").insert({ chat_id: chatId, role: "user", text: question, api: [userTurn] });

    // The memory rides on the chat's first message, so it never changes the cached prefix.
    const first: Param[] = [{ role: "user", content: `Chat memory (what you knew when this chat started):\n\n${memory}` }];
    const turn: Param[] = [userTurn];
    const client = new Anthropic();
    let answer = "";

    for (let step = 0; step < MAX_STEPS; step++) {
      const stream = client.beta.messages.stream({
        model: COACH_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages: [...first, ...history, ...turn],
      });
      stream.on("text", (t) => emit({ type: "text", text: t }));
      const message = await stream.finalMessage();
      await recordUsage("coach_chat", message.model, message.usage, chatId);

      if (message.stop_reason === "refusal") throw new Error("The coach declined to answer that.");
      if (message.stop_reason === "max_tokens") throw new Error("The answer got cut off. Try a narrower question.");
      turn.push({ role: "assistant", content: message.content as Anthropic.Beta.BetaContentBlockParam[] });
      const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      if (text.trim()) answer = answer ? `${answer}\n\n${text}` : text;

      const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (message.stop_reason !== "tool_use" || !calls.length) break;
      if (step === MAX_STEPS - 1) throw new Error("That took too many lookups. Try a narrower question.");

      for (const label of new Set(calls.map((c) => TOOL_LABEL[c.name] ?? "Looking things up"))) emit({ type: "tool", label });
      if (text.trim()) emit({ type: "text", text: "\n\n" });
      const results = await Promise.all(calls.map((c) => runTool(c.name, c.input, chatId!)));
      turn.push({
        role: "user",
        content: calls.map((c, i) => ({
          type: "tool_result" as const,
          tool_use_id: c.id,
          content: results[i].content,
          ...(results[i].isError ? { is_error: true } : {}),
        })),
      });
    }

    if (!answer.trim()) throw new Error("The coach came back without an answer. Try again.");
    await db()
      .from("coach_messages")
      .insert({ chat_id: chatId, role: "assistant", text: answer, api: turn.slice(1) });
    await db().from("coach_chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
    emit({ type: "done" });
  } catch (err) {
    console.error("coach chat:", err);
    // The question stays saved; the next question simply follows it.
    emit({
      type: "error",
      message:
        err instanceof Anthropic.AuthenticationError
          ? "The Anthropic API key was rejected."
          : err instanceof Anthropic.RateLimitError
            ? "Anthropic is rate-limiting right now. Try again in a minute."
            : err instanceof Anthropic.APIError
              ? `Anthropic returned an error (${err.status}).`
              : err instanceof Error && !("code" in err)
                ? err.message
                : "Something went wrong. Try again.",
    });
  }
}

/* ---------- Sample mode (no database) ---------- */

const SAMPLE_CHATS: ChatSummary[] = [
  { id: "00000000-0000-4000-8000-000000000001", title: "How much did I spend on food delivery this year?", updatedAt: "2026-11-20T19:12:00Z" },
  { id: "00000000-0000-4000-8000-000000000002", title: "Which subscriptions can I cancel?", updatedAt: "2026-11-02T08:40:00Z" },
];
const SAMPLE_MESSAGES: ChatMessageView[] = [
  { id: "s1", role: "user", text: "How much did I spend on food delivery this year?" },
  {
    id: "s2",
    role: "assistant",
    text: "**€ 1.184** on delivery since January, across **52 orders**. That's about € 108 a month.\n\n- Thuisbezorgd: 38 orders, € 846\n- Uber Eats: 14 orders, € 338\n\nOctober was the peak at € 162. Halving it gets you roughly **€ 650 a year** back, which is most of your savings target for a month.",
  },
];
