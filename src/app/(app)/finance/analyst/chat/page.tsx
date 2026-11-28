import Link from "next/link";
import { hasDatabase } from "@/lib/supabase";
import { CoachChat } from "@/modules/finance/CoachChat";
import { ANALYST_SAMPLE_CHATS, ANALYST_SAMPLE_MESSAGES } from "@/modules/finance/analyst-chat";
import { getChatMessages, listChats } from "@/modules/finance/coach-chat";
import { hasAnthropic } from "@/modules/finance/coach";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

export default async function AnalystChatPage({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const { chat } = await searchParams;
  const chats = await listChats("analyst", ANALYST_SAMPLE_CHATS);
  const chatId = chat && UUID.test(chat) && chats.some((c) => c.id === chat) ? chat : null;
  const messages = chatId ? await getChatMessages(chatId, ANALYST_SAMPLE_MESSAGES) : [];
  const ready = hasDatabase() && hasAnthropic();

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Ask the analyst</h1>
      <p className="mt-2 max-w-[62ch] text-muted">
        Questions about your investments, answered from your portfolio and your monthly reviews. For anything newer it
        searches the web and links the source. It only reads, and it never places trades.
      </p>
      {!hasDatabase() && (
        <p className="mt-4 inline-block rounded-md border border-line px-2.5 py-1 text-xs text-muted">
          Showing an example chat. Yours appear here once Supabase is connected.
        </p>
      )}

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16">
        <CoachChat
          key={chatId ?? "new"}
          agent="analyst"
          chatId={chatId}
          initial={messages}
          disabledReason={
            !hasDatabase()
              ? "Sample mode: connect Supabase to chat."
              : !hasAnthropic()
                ? "Add the Anthropic API key first (see Check-in)."
                : null
          }
        />

        <aside aria-labelledby="chats" className="lg:border-l lg:border-line lg:pl-8">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="chats" className="text-sm text-muted">Chats</h2>
            {chatId && ready && (
              <Link href="/finance/analyst/chat" className="rounded text-sm text-dawn underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-dawn">
                New chat
              </Link>
            )}
          </div>
          {chats.length ? (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {chats.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/finance/analyst/chat?chat=${c.id}`}
                    aria-current={c.id === chatId ? "page" : undefined}
                    className="-mx-2 block rounded-md px-2 py-2.5 hover:bg-surface focus-visible:outline-2 focus-visible:outline-dawn"
                  >
                    <span className={`line-clamp-2 text-[15px] ${c.id === chatId ? "text-dawn" : ""}`}>{c.title}</span>
                    <span className="text-xs text-faint">{day(c.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-faint">No chats yet.</p>
          )}
        </aside>
      </div>
    </>
  );
}
