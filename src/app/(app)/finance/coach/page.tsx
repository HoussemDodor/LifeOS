import Link from "next/link";
import { hasDatabase } from "@/lib/supabase";
import { CoachChat } from "@/modules/finance/CoachChat";
import { getChatMessages, listChats } from "@/modules/finance/coach-chat";
import { hasAnthropic } from "@/modules/finance/coach";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

export default async function CoachPage({ searchParams }: { searchParams: Promise<{ chat?: string }> }) {
  const { chat } = await searchParams;
  const chats = await listChats();
  const chatId = chat && UUID.test(chat) && chats.some((c) => c.id === chat) ? chat : null;
  const messages = chatId ? await getChatMessages(chatId) : [];
  const ready = hasDatabase() && hasAnthropic();

  return (
    <>
      <Link href="/finance" className="text-sm text-muted underline-offset-4 hover:text-text hover:underline">
        Finance
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Ask the coach</h1>
      <p className="mt-2 max-w-[62ch] text-muted">
        Your spending coach, on call. It looks things up in your transactions and check-ins and remembers earlier chats.
        It only reads: targets and promises stay yours to set.
      </p>
      {!hasDatabase() && (
        <p className="mt-4 inline-block rounded-md border border-line px-2.5 py-1 text-xs text-muted">
          Showing an example chat. Yours appear here once Supabase is connected.
        </p>
      )}

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16">
        <CoachChat
          key={chatId ?? "new"}
          chatId={chatId}
          initial={messages}
          disabledReason={
            !hasDatabase()
              ? "Sample mode: connect Supabase to chat."
              : !hasAnthropic()
                ? "Add the Anthropic API key first (see Monthly check-in)."
                : null
          }
        />

        <aside aria-labelledby="chats" className="lg:border-l lg:border-line lg:pl-8">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="chats" className="text-sm text-muted">Chats</h2>
            {chatId && ready && (
              <Link href="/finance/coach" className="rounded text-sm text-dawn underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-dawn">
                New chat
              </Link>
            )}
          </div>
          {chats.length ? (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {chats.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/finance/coach?chat=${c.id}`}
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
