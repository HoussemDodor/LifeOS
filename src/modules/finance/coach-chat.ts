import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAiUsageMonth, recordUsage } from "@/lib/ai-usage";
import { eur } from "@/lib/format";
import { db, hasDatabase } from "@/lib/supabase";
import { COACH_MODEL } from "./coach";
import { amsterdamYmd } from "./facts";
import { CardSchema, type Card } from "./coach-cards";
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
  | { type: "card"; card: Card }
  | { type: "done" }
  | { type: "error"; message: string };

const MAX_STEPS = 8;

const SYSTEM = `You are the spending coach inside LifeOS, Houssem's personal dashboard. This is the chat: he asks about his money, you look it up in his own data and tell him what you think. You're a coach, not a bank statement: have an opinion and push him to act.

Voice: Gen Z, blunt, specific, a bit funny, never cringe. Talk to him as "you". Short sentences. At most one emoji. Say the uncomfortable thing plainly ("Spotify went up and nobody pays you back anymore. You're funding the whole family plan.").

Shape of every answer:
1. The verdict first, in one bold line: the answer plus your take on it.
2. The evidence: only the 2–4 numbers that matter, with real shops and dates. If a card shows the details, don't repeat its rows; point at what stands out.
3. "**Your move:**" one concrete action with what it's worth in € per year (or per month), when there's anything worth doing. If he's doing fine, say so and skip the move.
Usually 40–150 words of text. Go longer only when he asks for a breakdown.

Be a sharp coach:
- Look for the lever: the biggest cost he controls, a price increase, a payback that stopped, a double charge, a bill that jumped. Rank, don't list.
- Compare like with like: this month vs his usual month, a cost per year, a cost vs his income or his total spending. Never compare unrelated numbers (fixed costs are not a share of his savings target).
- Use recurring_costs for subscriptions, fixed costs and "what do I pay every month". It looks across all categories; the Subscriptions category alone misses insurance, phone and gym.
- Use spending_totals or income_and_savings for totals and comparisons; don't add up rows from find_transactions yourself. Simple arithmetic on tool results (a difference, × 12) is fine.

Cards (show_card): attach one when the answer compares 3 or more amounts: a ranking (categories, shops), a trend (months) or a list (fixed costs, payments). At most 2 per answer, usually 1. Copy every value exactly from a lookup result; the app refuses a card with numbers it can't find there. Spending is positive. Call show_card before you write your final text, and keep the text about what the card means.

Facts and rules:
- Look things up before you state a number. Never guess amounts, dates or shops. If the tools don't have it, say so.
- Dates: the chat memory gives today's date and what period the data covers. "Last month" is the previous calendar month. If a month isn't complete in the data, say the numbers may be low.
- Money the Dutch way: € 1.234,56 (or € 1.234 for round amounts). Write in English.
- Your share is after Tikkie paybacks; transfers between his accounts, investing and paybacks are not spending; only the Income category is income; shop refunds lower spending. An "ING creditcard" collection is a lump sum of card spending, and Klarna/PayPal/Mollie hide the shop: say the detail is invisible rather than guessing.
- Payments to people can be shared costs, gifts or family support. Don't moralise about them.
- When he mentions something from before, check search_past_chats or checkin_reports.

Limits:
- You can only read. You can't change his savings target, promises, categories or transactions. If he asks, tell him where: the target and promises on the Monthly check-in page, categories on the Finance page.
- Investments and crypto are for the portfolio analyst. You can say how much moved to DEGIRO or Bitvavo (the Investing category), but no investment advice.
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
  cards?: Card[];
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
    .select("id,role,text,cards")
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

/* ---------- Cards ---------- */

/** Every number (in cents, unsigned) that appears in a lookup result of this chat. */
function lookupNumbers(messages: Param[]): Set<number> {
  const out = new Set<number>();
  const walk = (v: unknown) => {
    if (typeof v === "number") out.add(Math.round(Math.abs(v) * 100));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const m of messages) {
    if (m.role !== "user" || typeof m.content === "string") continue;
    for (const b of m.content) {
      if (b.type !== "tool_result" || b.is_error || typeof b.content !== "string") continue;
      try {
        walk(JSON.parse(b.content));
      } catch {
        // not JSON: nothing to collect
      }
    }
  }
  return out;
}

/** Validate a card: the right shape, and only numbers LifeOS computed. */
function checkCard(input: unknown, known: Set<number>): { card: Card } | { error: string } {
  const parsed = CardSchema.safeParse(input);
  if (!parsed.success) {
    return { error: `Card refused: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
  }
  const card = parsed.data;
  const values = [...card.rows.map((r) => r.value), ...(card.total ? [card.total.value] : [])];
  const missing = values.filter((v) => !known.has(Math.round(Math.abs(v) * 100)));
  if (missing.length) {
    return { error: `Card refused: ${missing.join(", ")} not found in your lookup results. Copy values exactly from a lookup, or look them up first.` };
  }
  if (card.kind === "months" && card.rows.some((r) => !/^\d{4}-\d{2}$/.test(r.label))) {
    return { error: "Card refused: months cards need labels like 2026-10, oldest first." };
  }
  return { card: { ...card, rows: card.rows.map((r) => ({ ...r, value: Math.abs(r.value) })) } };
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
    const cards: Card[] = [];

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

      const lookups = calls.filter((c) => c.name !== "show_card");
      for (const label of new Set(lookups.map((c) => TOOL_LABEL[c.name] ?? "Looking things up"))) emit({ type: "tool", label });
      if (text.trim()) emit({ type: "text", text: "\n\n" });
      const known = lookupNumbers([...history, ...turn]);
      const results = await Promise.all(
        calls.map(async (c) => {
          if (c.name !== "show_card") return runTool(c.name, c.input, chatId!);
          if (cards.length >= 2) return { content: "Card refused: at most 2 cards per answer.", isError: true };
          const res = checkCard(c.input, known);
          if ("error" in res) return { content: res.error, isError: true };
          cards.push(res.card);
          emit({ type: "card", card: res.card });
          return { content: "Card shown under your answer.", isError: false };
        }),
      );
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
      .insert({ chat_id: chatId, role: "assistant", text: answer, api: turn.slice(1), cards });
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
    text: "**€ 1.184 on delivery since January, and it's speeding up.** 38 of your 52 orders went to Thuisbezorgd.\n\nOctober was the worst month at **€ 162**, and the last three months are all above your € 108 average.\n\n**Your move:** cap it at 2 orders a week. That's about **€ 650 a year** back.",
    cards: [
      {
        kind: "months",
        title: "Food delivery per month",
        rows: [
          { label: "2026-01", value: 92.4 },
          { label: "2026-02", value: 71.15 },
          { label: "2026-03", value: 104.8 },
          { label: "2026-04", value: 88.3 },
          { label: "2026-05", value: 96.75 },
          { label: "2026-06", value: 79.9 },
          { label: "2026-07", value: 118.45 },
          { label: "2026-08", value: 101.2 },
          { label: "2026-09", value: 131.6 },
          { label: "2026-10", value: 162.05 },
          { label: "2026-11", value: 137.4 },
        ],
        highlight: "2026-10",
      },
    ],
  },
  { id: "s3", role: "user", text: "And what do I pay every month no matter what?" },
  {
    id: "s4",
    role: "assistant",
    text: "**About € 263 a month is gone before you buy anything.** Health insurance is more than half of it, and that one isn't optional.\n\nTwo things are worth a look: Spotify went up to € 23,99 and nobody has paid you back since August, and Odido billed **€ 147,53** in October, € 120 over normal.\n\n**Your move:** ask for the Spotify share again or switch to Individual. Either way that's about **€ 120 a year**.",
    cards: [
      {
        kind: "list",
        title: "Your fixed costs",
        rows: [
          { label: "CZ health insurance", value: 161.95 },
          { label: "Il Fiore gym", value: 32.68 },
          { label: "Odido", value: 27.08, note: "€ 147,53 in Oct" },
          { label: "Spotify", value: 23.99, note: "up from € 21,99, no payback" },
          { label: "DUO", value: 17.5 },
        ],
        highlight: "Spotify",
        total: { label: "Per month", value: 263.2 },
      },
      {
        kind: "ranking",
        title: "Spending by category, November",
        rows: [
          { label: "Groceries", value: 312.4 },
          { label: "Insurance", value: 161.95 },
          { label: "Eating out", value: 137.4 },
          { label: "Subscriptions", value: 41.49 },
          { label: "Transport", value: 28.6 },
        ],
        highlight: "Eating out",
      },
    ],
  },
];
