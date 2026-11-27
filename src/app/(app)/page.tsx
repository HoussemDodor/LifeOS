import Link from "next/link";
import { Mail } from "lucide-react";
import { Sparkline } from "@/components/Sparkline";
import { eur, localHours, longDate, relativeDue, time } from "@/lib/format";
import { clashesWith, workoutOn } from "@/modules/health/schedule";
import { DayRibbon } from "@/modules/today/DayRibbon";
import { TaskList } from "@/modules/today/TaskList";
import { getTodayData } from "@/modules/today/data";

export const dynamic = "force-dynamic";

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Amsterdam" }).format(now));
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function TodayPage() {
  const now = new Date();
  const { briefing, tasks, netWorth, isSample } = await getTodayData(now);
  const actionEmails = briefing?.emails.filter((e) => e.needsAction) ?? [];
  const events = briefing?.events ?? [];
  const workout = workoutOn(now);
  const clashes = clashesWith(workout, events, localHours);

  return (
    <>
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{greeting(now)}, Houssem</h1>
        <p className="text-muted">{longDate(now)}</p>
      </header>

      {isSample && (
        <p className="mt-4 inline-block rounded-md border border-line px-2.5 py-1 text-xs text-muted">
          Showing sample data. Add your Notion key to see your own day.
        </p>
      )}

      <section aria-labelledby="agenda" className="mt-12">
        <h2 id="agenda" className="sr-only">Agenda</h2>
        {events.length > 0 || workout ? (
          <DayRibbon events={events} workout={workout} now={now} />
        ) : (
          <p className="text-muted">Nothing on your calendar today, and it’s a rest day.</p>
        )}
        {clashes.length > 0 && workout && (
          <p role="status" className="mt-4 text-sm text-dawn">
            {clashes.join(" and ")} overlaps your {workout.session.toLowerCase()} session ({workout.start}–{workout.end}).
          </p>
        )}
      </section>

      <div className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16">
        <section aria-labelledby="brief">
          <h2 id="brief" className="text-sm text-muted">
            Morning brief
            {briefing && <span className="text-faint"> · written {time(briefing.generatedAt)}</span>}
          </h2>
          {briefing ? (
            <>
              <p className="mt-4 max-w-[62ch] font-serif text-[1.35rem] leading-[1.6] text-text/95">{briefing.prose}</p>

              {actionEmails.length > 0 && (
                <ul className="mt-8 divide-y divide-line border-y border-line">
                  {actionEmails.map((e) => (
                    <li key={e.id} className="flex gap-3 py-3.5">
                      <Mail className="mt-0.5 size-4 shrink-0 text-dawn" strokeWidth={1.75} aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-[15px]">
                          <span className="text-muted">{e.from}</span> {e.subject}
                        </p>
                        <p className="mt-0.5 text-sm text-muted">{e.summary}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {briefing.skippedCount > 0 && (
                <p className="mt-3 text-sm text-faint">
                  {briefing.skippedCount} newsletters and notifications skipped.
                </p>
              )}
            </>
          ) : (
            <p className="mt-4 text-muted">Today’s brief arrives at 07:00.</p>
          )}
        </section>

        <aside className="space-y-12">
          <section aria-labelledby="tasks">
            <div className="flex items-baseline justify-between">
              <h2 id="tasks" className="text-sm text-muted">Up next in Notion</h2>
              <span className="text-xs text-faint">{tasks.length} open</span>
            </div>
            <TaskList
              tasks={tasks.map((t) => {
                const due = relativeDue(t.due, now);
                return {
                  id: t.id,
                  title: t.title,
                  dueLabel: due,
                  dueSoon: due.includes("overdue") || due === "Today",
                  fromEmail: t.fromEmail,
                };
              })}
            />
          </section>

          {netWorth && (
            <section aria-labelledby="networth">
              <h2 id="networth" className="text-sm text-muted">Net worth</h2>
              <Link href="/finance" className="mt-3 flex items-end justify-between gap-4 rounded-md py-1 hover:opacity-90">
                <div>
                  <p className="text-2xl font-semibold tabular-nums tracking-tight">{eur(netWorth.total)}</p>
                  <p className={`text-sm tabular-nums ${netWorth.change30d >= 0 ? "text-gain" : "text-loss"}`}>
                    {netWorth.change30d >= 0 ? "+" : "−"}
                    {eur(Math.abs(netWorth.change30d))} in 30 days
                  </p>
                </div>
                <Sparkline values={netWorth.history} className="h-8 w-28" />
              </Link>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
