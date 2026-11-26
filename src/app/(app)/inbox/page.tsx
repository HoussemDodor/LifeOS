import { time } from "@/lib/format";
import { getTodayData } from "@/modules/today/data";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const { briefing } = await getTodayData();
  const emails = briefing?.emails ?? [];
  const events = briefing?.events ?? [];

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Inbox & agenda</h1>
      <p className="mt-2 text-muted">Last 24 hours of your Outlook inbox, matched to today’s meetings.</p>

      <div className="mt-12 space-y-12">
        {events.map((ev) => {
          const related = emails.filter((m) => ev.relatedEmailIds?.includes(m.id));
          return (
            <section key={ev.id} className="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
              <p className="text-sm tabular-nums text-muted">
                {time(ev.start)}–{time(ev.end)}
              </p>
              <div>
                <h2 className="text-lg">{ev.title}</h2>
                {related.length > 0 ? (
                  <ul className="mt-3 space-y-3 border-l border-line pl-4">
                    {related.map((m) => (
                      <li key={m.id}>
                        <p className="text-[15px]">{m.subject}</p>
                        <p className="text-sm text-muted">{m.from}: {m.summary}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-faint">No related email.</p>
                )}
              </div>
            </section>
          );
        })}

        <section className="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
          <p className="text-sm text-muted">Other mail</p>
          <ul className="space-y-3">
            {emails
              .filter((m) => !events.some((ev) => ev.relatedEmailIds?.includes(m.id)))
              .map((m) => (
                <li key={m.id}>
                  <p className="text-[15px]">
                    {m.subject} {m.needsAction && <span className="text-sm text-dawn">needs action</span>}
                  </p>
                  <p className="text-sm text-muted">{m.from}: {m.summary}</p>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </>
  );
}
