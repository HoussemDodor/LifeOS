"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { CoachCard } from "./CoachCard";
import type { ChatEvent, ChatMessageView } from "./coach-chat";

const SUGGESTIONS = [
  "Where did my money go last month?",
  "How much do I spend on food delivery?",
  "Which subscriptions am I paying for?",
  "Am I on track for my savings target?",
];

interface Msg extends ChatMessageView {
  pending?: boolean;
}

export function CoachChat({
  chatId: initialId,
  initial,
  disabledReason,
}: {
  chatId: string | null;
  initial: ChatMessageView[];
  disabledReason: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [chatId, setChatId] = useState(initialId);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (messages.length) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const patchLast = (f: (m: Msg) => Msg) => setMessages((ms) => [...ms.slice(0, -1), f(ms[ms.length - 1])]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy || disabledReason) return;
    setBusy(true);
    setError(null);
    setStatus("Thinking");
    setInput("");
    setMessages((ms) => [
      ...ms,
      { id: `u${Date.now()}`, role: "user", text: q },
      { id: `a${Date.now()}`, role: "assistant", text: "", pending: true },
    ]);

    let failed = false;
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, message: q }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Couldn’t reach the coach. Try again.");
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as ChatEvent;
          if (e.type === "chat" && e.id !== chatId) {
            setChatId(e.id);
            window.history.replaceState(null, "", `/finance/coach?chat=${e.id}`);
          } else if (e.type === "text") {
            setStatus(null);
            patchLast((m) => ({ ...m, text: m.text + e.text }));
          } else if (e.type === "card") {
            patchLast((m) => ({ ...m, cards: [...(m.cards ?? []), e.card] }));
          } else if (e.type === "tool") {
            setStatus(e.label);
          } else if (e.type === "error") {
            failed = true;
            setError(e.message);
          }
        }
      }
    } catch (err) {
      failed = true;
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }

    setStatus(null);
    setBusy(false);
    // Drop an empty or half-written answer when it failed; the question stays.
    setMessages((ms) => {
      const last = ms[ms.length - 1];
      if (last?.role !== "assistant") return ms;
      if (failed || !last.text.trim()) return ms.slice(0, -1);
      return [...ms.slice(0, -1), { ...last, pending: false }];
    });
    if (failed) setInput((v) => v || q);
    router.refresh(); // updates the chat list
    boxRef.current?.focus();
  }

  return (
    <section aria-label="Chat" className="min-w-0">
      {messages.length === 0 ? (
        <div>
          <p className="text-muted">Ask anything about your spending. A few to start with:</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  disabled={busy || Boolean(disabledReason)}
                  onClick={() => ask(s)}
                  className="rounded-full border border-line px-3.5 py-1.5 text-sm text-muted hover:bg-surface hover:text-text disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-dawn"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ol className="space-y-8" aria-live="polite" aria-busy={busy}>
          {messages.map((m) =>
            m.role === "user" ? (
              <li key={m.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-surface px-4 py-2.5 text-[15px] sm:max-w-[75%]">
                  <span className="sr-only">You: </span>
                  {m.text}
                </p>
              </li>
            ) : (
              <li key={m.id} className="max-w-[68ch]">
                <p className="mb-1.5 text-xs text-faint">Coach</p>
                {m.text ? (
                  <Markdown text={m.text} className="text-[15px] leading-relaxed text-text/90" />
                ) : null}
                {m.cards?.length ? (
                  <div className="mt-5 space-y-4">
                    {m.cards.map((c, i) => (
                      <CoachCard key={i} card={c} />
                    ))}
                  </div>
                ) : null}
                {m.pending && status && (
                  <p role="status" className="mt-1 flex items-center gap-2.5 text-sm text-muted">
                    <span className="size-2 animate-pulse rounded-full bg-dawn" aria-hidden="true" />
                    {status}…
                  </p>
                )}
              </li>
            ),
          )}
        </ol>
      )}
      <div ref={endRef} />

      {error && (
        <p role="alert" className="mt-6 text-sm text-loss">
          {error}
        </p>
      )}

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <label htmlFor="ask" className="sr-only">
          Your question
        </label>
        <div className="flex items-end gap-2 rounded-lg border border-line bg-surface p-2 focus-within:outline-2 focus-within:outline-dawn">
          <textarea
            id="ask"
            ref={boxRef}
            rows={2}
            maxLength={2000}
            value={input}
            disabled={Boolean(disabledReason)}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void ask(input);
              }
            }}
            placeholder={disabledReason ?? (messages.length ? "Ask a follow-up" : "Ask about your spending")}
            className="min-h-[2.75rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-faint disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={busy || !input.trim() || Boolean(disabledReason)}
            className="shrink-0 rounded-md bg-dawn px-4 py-2 text-sm font-medium text-ink hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dawn"
          >
            {busy ? "Answering…" : "Ask"}
          </button>
        </div>
        <p className="mt-2 text-xs text-faint">
          Enter to send, Shift+Enter for a new line. Answers come from your own data; a question costs a few cents.
        </p>
      </form>
    </section>
  );
}
