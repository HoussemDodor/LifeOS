import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import { eur } from "@/lib/format";
import { hasDatabase } from "@/lib/supabase";
import { NewPromises, RunCheckin, TargetProposal, UndoChange, WaitForReport } from "@/modules/finance/CheckinParts";
import { hasAnthropic } from "@/modules/finance/coach";
import { getCheckinPage } from "@/modules/finance/checkin-data";
import { monthToReview } from "@/modules/finance/facts";

export const dynamic = "force-dynamic";
// The coach runs in the background after the button is pressed; give it room.
export const maxDuration = 300;

const monthName = (ym: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESULT = { hit: "Hit", partly: "Partly", missed: "Missed" } as const;

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const { current, history, target } = await getCheckinPage(id && UUID.test(id) ? id : undefined);
  const month = monthToReview();
  const proposal = target.find((t) => t.status === "proposed");
  const active = target.find((t) => t.status === "active");
  const r = current?.report;
  const f = current?.facts;
  const ready = hasDatabase() && hasAnthropic();
  const doneForMonth = history.some((h) => h.month === month && h.status === "done");

  return (
    <>
      <Link href="/finance" className="text-sm text-muted underline-offset-4 hover:text-text hover:underline">
        Finance
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Monthly check-in</h1>
      <p className="mt-2 max-w-[62ch] text-muted">
        Your spending coach goes through last month: where the money went, what to cut, and whether you kept your
        promises.
      </p>
      {!hasDatabase() && (
        <p className="mt-4 inline-block rounded-md border border-line px-2.5 py-1 text-xs text-muted">
          Showing an example report. Your own appears here after your first check-in.
        </p>
      )}

      <section aria-label="Run the check-in" className="mt-8">
        <RunCheckin
          month={monthName(month)}
          disabled={!ready || current?.status === "running"}
          label={doneForMonth ? `Run ${monthName(month)} again` : `Run check-in for ${monthName(month)}`}
        />
        {hasDatabase() && !hasAnthropic() && (
          <div className="mt-4 max-w-[62ch] rounded-md border border-line px-4 py-3 text-sm text-muted">
            <p className="text-text">One-time setup: an Anthropic API key</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 marker:text-faint">
              <li>On console.anthropic.com, create an API key and set a monthly spend limit (e.g. € 10).</li>
              <li>
                Paste it into <code className="text-text">.env.production.local</code> as{" "}
                <code className="text-text">ANTHROPIC_API_KEY</code>.
              </li>
              <li>
                Run <code className="text-text">node scripts/push-secrets.mjs ANTHROPIC_API_KEY</code> and ask Claude to
                redeploy.
              </li>
            </ol>
          </div>
        )}
      </section>

      {current?.status === "running" && (
        <section className="mt-12">
          <WaitForReport />
        </section>
      )}

      {current?.status === "failed" && (
        <p role="status" className="mt-12 text-loss">
          The {monthName(current.month)} check-in didn’t finish: {current.error ?? "unknown error"}
        </p>
      )}

      {current?.status === "done" && r && (
        <article aria-labelledby="headline" className="mt-12 border-t border-line pt-10">
          <p className="text-sm text-muted">
            {monthName(current.month)}
            {current.finishedAt && (
              <span className="text-faint">
                {" "}
                · written {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).format(new Date(current.finishedAt))}
              </span>
            )}
          </p>
          <h2 id="headline" className="mt-2 max-w-[28ch] text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {r.headline}
          </h2>

          {f && (
            <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
              <Stat label="Spent" value={eur(f.review_month.spent)} />
              <Stat label="Came in" value={eur(f.review_month.received)} />
              <Stat label="Saved" value={eur(f.review_month.saved)} tone={f.review_month.saved >= 0 ? "gain" : "loss"} />
              {f.target && (
                <Stat
                  label={`Target ${eur(f.target.monthly_savings)}`}
                  value={f.target.hit ? "Hit" : "Missed"}
                  tone={f.target.hit ? "gain" : "loss"}
                />
              )}
            </dl>
          )}
          {f && !f.data_complete && (
            <p className="mt-3 text-sm text-dawn">Your data for this month stops at {f.data_until}, so the numbers may be low.</p>
          )}

          <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-16">
            <Markdown text={r.briefing} className="max-w-[62ch] font-serif text-[1.15rem] leading-[1.65] text-text/90" />

            <aside className="space-y-10">
              {proposal && <TargetProposal id={proposal.id} amount={proposal.monthly_savings} reasoning={proposal.reasoning} />}
              {!proposal && active && (
                <p className="text-sm text-muted">
                  Your savings target: <span className="tabular-nums text-text">{eur(active.monthly_savings)}</span> a month.
                </p>
              )}

              {current.scoredPromises.length > 0 && (
                <section aria-labelledby="scored">
                  <h3 id="scored" className="text-sm text-muted">Last month’s promises</h3>
                  <ul className="mt-3 divide-y divide-line border-y border-line">
                    {current.scoredPromises.map((p) => (
                      <li key={p.id} className="py-3">
                        <div className="flex items-baseline justify-between gap-4">
                          <p className="text-[15px]">{p.text}</p>
                          {p.result && (
                            <span className={`shrink-0 text-sm ${p.result === "hit" ? "text-gain" : p.result === "missed" ? "text-loss" : "text-muted"}`}>
                              {RESULT[p.result]}
                            </span>
                          )}
                        </div>
                        {p.evidence && <p className="mt-0.5 text-xs text-faint">{p.evidence}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {current.newPromises.length > 0 && (
                <section aria-labelledby="promises">
                  <h3 id="promises" className="text-sm text-muted">Your promises for next month</h3>
                  <p className="mt-1 text-xs text-faint">Accept the ones you’ll actually do. The next check-in scores them.</p>
                  <div className="mt-3">
                    <NewPromises promises={current.newPromises} />
                  </div>
                </section>
              )}

              {r.savings_ideas.length > 0 && (
                <section aria-labelledby="ideas">
                  <h3 id="ideas" className="text-sm text-muted">Where you could save</h3>
                  <ul className="mt-3 divide-y divide-line border-y border-line">
                    {r.savings_ideas.map((s) => (
                      <li key={s.idea} className="flex items-baseline justify-between gap-4 py-2.5">
                        <span className="text-[15px]">{s.idea}</span>
                        <span className="shrink-0 tabular-nums text-sm text-gain">{eur(s.eur_per_year)}/yr</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {current.changes.length > 0 && (
                <section aria-labelledby="changes">
                  <h3 id="changes" className="text-sm text-muted">Categories the coach fixed</h3>
                  <ul className="mt-3 divide-y divide-line border-y border-line">
                    {current.changes.map((c) => (
                      <li key={c.id} className="flex items-baseline justify-between gap-4 py-2.5">
                        <div className="min-w-0">
                          <p className={`truncate text-[15px] ${c.undone ? "text-faint line-through" : ""}`}>{c.shop}</p>
                          <p className="text-xs text-faint">
                            {c.from ?? "Other"} → {c.to}
                            {c.reason && ` · ${c.reason}`}
                          </p>
                        </div>
                        {c.undone ? <span className="text-sm text-faint">Undone</span> : <UndoChange id={c.id} />}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>
          </div>

          <p className="mt-10 text-xs text-faint">
            Written by Claude from your own transactions. LifeOS computes every total; the coach only interprets them.
          </p>
        </article>
      )}

      {!current && hasDatabase() && (
        <p className="mt-12 text-muted">No check-ins yet. Upload last month’s exports on Finance, then press the button.</p>
      )}

      {history.length > 1 && (
        <section aria-labelledby="history" className="mt-16 border-t border-line pt-8">
          <h2 id="history" className="text-sm text-muted">Earlier check-ins</h2>
          <ul className="mt-3 divide-y divide-line">
            {history.map((h) => (
              <li key={h.id}>
                <Link
                  href={`/finance/checkin?id=${h.id}`}
                  aria-current={current?.id === h.id ? "page" : undefined}
                  className="-mx-2 flex items-baseline justify-between gap-4 rounded-md px-2 py-2.5 hover:bg-surface"
                >
                  <span className="min-w-0 truncate text-[15px]">{h.headline ?? (h.status === "failed" ? "Didn’t finish" : "Running…")}</span>
                  <span className={`shrink-0 text-sm ${current?.id === h.id ? "text-dawn" : "text-faint"}`}>{monthName(h.month)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" }) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className={`text-2xl font-semibold tabular-nums tracking-tight ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
