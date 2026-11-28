import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { eur } from "@/lib/format";
import { hasDatabase } from "@/lib/supabase";
import { CorePlanDecision, RunAnalysis } from "@/modules/finance/AnalystParts";
import { WaitForReport } from "@/modules/finance/CheckinParts";
import type { AnalystReport } from "@/modules/finance/analyst";
import { getAnalystPage, type CorePlan } from "@/modules/finance/analyst-data";
import { hasAnthropic } from "@/modules/finance/coach";

export const dynamic = "force-dynamic";
// The analyst runs in the background after the button is pressed; give it room.
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const monthName = (ym: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));
const day = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" }).format(
    new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso),
  );
const pct = (n: number) => `${n.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${eur(Math.abs(n))}`;
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const VERDICT = { hold: "Hold", add: "Add", trim: "Trim" } as const;

type Stock = AnalystReport["research"]["stocks"][number];
type Fund = AnalystReport["research"]["funds"][number];

export default async function AnalystPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const { current, history, plans, isSample } = await getAnalystPage(id && UUID.test(id) ? id : undefined);
  const r = current?.status === "done" ? current.report : null;
  const f = current?.facts;
  const proposal = plans.find((p) => p.status === "proposed");
  const active = plans.find((p) => p.status === "active");
  const ready = hasDatabase() && hasAnthropic();

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Portfolio analyst</h1>
      <p className="mt-2 max-w-[62ch] text-muted">
        A monthly review of your investments against your own rules, with a source for every claim. It runs with the
        check-in, or on its own from here.
      </p>
      {isSample && (
        <p className="mt-4 inline-block rounded-md border border-line px-2.5 py-1 text-xs text-muted">
          Showing an example report. Yours appears after your first analysis.
        </p>
      )}

      <section aria-label="Run the analyst" className="mt-8">
        <RunAnalysis
          disabled={!ready || current?.status === "running"}
          label={history.some((h) => h.status === "done") ? "Run the analysis again" : "Run the analysis"}
        />
      </section>

      {current?.status === "running" && (
        <section className="mt-12">
          <WaitForReport text="The analyst is researching your holdings…" />
        </section>
      )}
      {current?.status === "failed" && (
        <p role="status" className="mt-12 text-loss">
          The analysis didn’t finish: {current.error ?? "unknown error"}
        </p>
      )}

      {r && f && (
        <article aria-labelledby="headline" className="mt-12 border-t border-line pt-10">
          <p className="text-sm text-muted">
            {monthName(current!.month)}
            {current!.finishedAt && <span className="text-faint"> · written {day(current!.finishedAt)}</span>}
            {f.degiro_export_date && <span className="text-faint"> · DEGIRO data of {day(f.degiro_export_date)}</span>}
          </p>
          <h2 id="headline" className="mt-2 max-w-[30ch] text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            {r.headline}
          </h2>

          <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3">
            <Stat label="Worth" value={eur(f.totals.worth_eur)} />
            {f.totals.gain_eur !== null && (
              <Stat
                label="Gain on what you put in"
                value={`${signed(f.totals.gain_eur)} (${pct(f.totals.gain_pct ?? 0)})`}
                tone={f.totals.gain_eur >= 0 ? "gain" : "loss"}
              />
            )}
            <Stat label="Core / satellite" value={`${pct(f.split_pct.core)} / ${pct(f.split_pct.satellite)}`} />
          </dl>
          {r.failed.length > 0 && (
            <p className="mt-3 text-sm text-dawn">Research didn’t finish for {r.failed.join(", ")}; the report covers the rest.</p>
          )}

          <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-16">
            <Markdown text={r.briefing} className="max-w-[62ch] font-serif text-[1.15rem] leading-[1.65] text-text/90" />
            <aside className="space-y-10">
              <section aria-labelledby="money">
                <h3 id="money" className="text-sm text-muted">Where new money goes</h3>
                <p className="mt-2 border-l-2 border-dawn pl-3 text-[15px]">{r.new_money}</p>
              </section>
              <CorePlanBlock proposal={proposal} active={active} />
              {r.watch.length > 0 && (
                <section aria-labelledby="watch">
                  <h3 id="watch" className="text-sm text-muted">Watch next month</h3>
                  <ul className="mt-3 divide-y divide-line border-y border-line">
                    {r.watch.map((w) => (
                      <li key={w} className="py-2.5 text-[15px]">
                        {w}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>
          </div>

          <section aria-labelledby="satellite" className="mt-16">
            <h3 id="satellite" className="text-lg font-medium">Satellite, position by position</h3>
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {r.positions.map((p) => {
                const h = f.holdings.find((x) => x.isin === p.isin);
                const s = r.research.stocks.find((x) => x.isin === p.isin);
                return (
                  <li key={p.isin} className="py-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                      <p className="text-[17px] font-medium">
                        {h?.name ?? s?.name ?? p.isin}
                        <span className="ml-3 text-sm font-normal text-muted">
                          Verdict: <span className="font-medium text-text">{VERDICT[p.verdict]}</span>
                        </span>
                      </p>
                      {h && (
                        <p className="text-sm tabular-nums text-muted">
                          {eur(h.value_eur)}
                          {h.gain_pct !== null && (
                            <span className={h.gain_pct >= 0 ? "text-gain" : "text-loss"}>
                              {" "}
                              {h.gain_pct >= 0 ? "+" : "−"}
                              {pct(Math.abs(h.gain_pct))}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <p className="mt-1.5 max-w-[70ch] text-[15px]">{p.one_liner}</p>
                    <p className="mt-1 text-xs text-faint">{p.size_note}</p>
                    {s && <StockResearch s={s} />}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="core" className="mt-16">
            <h3 id="core" className="text-lg font-medium">Core</h3>
            <p className="mt-3 max-w-[70ch] text-[15px]">{r.core.assessment}</p>
            <p className="mt-2 max-w-[70ch] text-sm text-muted">{r.core.currency_note}</p>
            {r.core.overlap.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm text-muted">Stocks you also own through the core</h4>
                <ul className="mt-2 divide-y divide-line border-y border-line">
                  {r.core.overlap.map((o) => (
                    <li key={`${o.stock}-${o.fund}`} className="flex items-baseline justify-between gap-4 py-2 text-[15px]">
                      <span>
                        {o.stock} <span className="text-sm text-faint">in {o.fund}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted">{pct(o.weight_pct)} of the fund</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.research.funds.map((fund) => (
              <FundFacts key={fund.isin} fund={fund} />
            ))}
          </section>

          <p className="mt-14 text-sm text-muted">
            Questions about this report?{" "}
            <Link href="/finance/analyst/chat" className="text-dawn underline-offset-4 hover:underline">
              Ask the analyst
            </Link>
          </p>
          <p className="mt-2 max-w-[70ch] text-xs text-faint">
            Analysis against your own rules, not licensed financial advice. LifeOS never places trades; every buy or sell is
            yours to decide in DEGIRO. Numbers about your portfolio come from LifeOS; market facts come from the linked
            sources, dated as shown.
          </p>
        </article>
      )}

      {!current && !isSample && hasDatabase() && (
        <p className="mt-12 text-muted">No analysis yet. Press the button, or run the monthly check-in.</p>
      )}

      {history.length > 1 && (
        <section aria-labelledby="history" className="mt-16 border-t border-line pt-8">
          <h2 id="history" className="text-sm text-muted">Earlier reports</h2>
          <ul className="mt-3 divide-y divide-line">
            {history.map((h) => (
              <li key={h.id}>
                <Link
                  href={`/finance/analyst?id=${h.id}`}
                  aria-current={current?.id === h.id ? "page" : undefined}
                  className="-mx-2 flex items-baseline justify-between gap-4 rounded-md px-2 py-2.5 hover:bg-surface"
                >
                  <span className="min-w-0 truncate text-[15px]">{h.headline ?? (h.status === "failed" ? "Didn’t finish" : "Running…")}</span>
                  <span className={`shrink-0 text-sm ${current?.id === h.id ? "text-dawn" : "text-faint"}`}>{day(h.createdAt)}</span>
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

function SourceLink({ url, date }: { url: string; date: string }) {
  if (!url) return <span className="text-faint">{date}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-faint underline-offset-4 hover:text-muted hover:underline focus-visible:outline-2 focus-visible:outline-dawn"
    >
      {host(url)}, {date}
      <ExternalLink className="size-3" aria-hidden="true" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function StockResearch({ s }: { s: Stock }) {
  const rows = [
    { label: "Results", ...s.latest_results },
    { label: "Valuation", ...s.valuation },
    ...s.news.map((n) => ({ label: "News", ...n })),
  ];
  return (
    <details className="group mt-3">
      <summary className="cursor-pointer list-none text-sm text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-dawn">
        <span className="group-open:hidden">Show the research</span>
        <span className="hidden group-open:inline">Hide the research</span>
      </summary>
      <div className="mt-3 max-w-[70ch] space-y-4 border-l border-line pl-4 text-[15px]">
        <p className="text-muted">{s.business}</p>
        <dl className="space-y-3">
          {rows.map((row, i) => (
            <div key={i}>
              <dt className="text-xs text-faint">{row.label}</dt>
              <dd>
                {row.text} <span className="text-xs"><SourceLink url={row.source_url} date={row.date} /></span>
              </dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="text-xs text-faint">Does the case still hold?</p>
          <p>{s.thesis_check}</p>
        </div>
        {s.risks.length > 0 && (
          <div>
            <p className="text-xs text-faint">Risks</p>
            <ul className="list-disc pl-5 marker:text-faint">
              {s.risks.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

function FundFacts({ fund }: { fund: Fund }) {
  const facts = [
    { label: "Tracks", value: fund.index_tracked },
    { label: "Yearly cost (TER)", value: fund.ter_pct === null ? "unknown" : `${fund.ter_pct.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%` },
    { label: "Companies", value: fund.holdings_count === null ? "unknown" : fund.holdings_count.toLocaleString("nl-NL") },
    { label: "Dividends", value: fund.distribution === "distributing" ? "Paid out" : fund.distribution === "accumulating" ? "Reinvested" : "unknown" },
  ];
  return (
    <div className="mt-8">
      <h4 className="text-[15px] font-medium">{fund.name}</h4>
      <dl className="mt-2 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
        {facts.map((x) => (
          <div key={x.label}>
            <dt className="text-xs text-faint">{x.label}</dt>
            <dd className="text-[15px]">{x.value}</dd>
          </div>
        ))}
      </dl>
      {fund.top_holdings.length > 0 && (
        <p className="mt-3 max-w-[70ch] text-sm text-muted">
          Biggest holdings: {fund.top_holdings.slice(0, 6).map((h) => `${h.name} ${pct(h.weight_pct)}`).join(", ")}.
        </p>
      )}
      {fund.regions.length > 0 && (
        <p className="mt-1 max-w-[70ch] text-sm text-muted">
          Regions: {fund.regions.slice(0, 4).map((x) => `${x.region} ${pct(x.weight_pct)}`).join(", ")}.
        </p>
      )}
      <p className="mt-2 text-xs">
        {fund.sources.slice(0, 2).map((s) => (
          <span key={s.url} className="mr-3">
            <SourceLink url={s.url} date={s.date} />
          </span>
        ))}
        {fund.cached && <span className="text-faint">Fund facts from an earlier search, refreshed every 3 months.</span>}
      </p>
    </div>
  );
}

function CorePlanBlock({ proposal, active }: { proposal?: CorePlan; active?: CorePlan }) {
  const plan = proposal ?? active;
  if (!plan) return null;
  return (
    <section aria-labelledby="coreplan" className={proposal ? "rounded-md border border-dawn/40 px-4 py-4" : ""}>
      <h3 id="coreplan" className="text-sm text-muted">{proposal ? "Proposed core make-up" : "Your core make-up"}</h3>
      <ul className="mt-3 space-y-3">
        {plan.plan.map((x) => (
          <li key={x.name}>
            <p className="flex items-baseline justify-between gap-4 text-[15px]">
              <span>{x.name}</span>
              <span className="shrink-0 tabular-nums">{pct(x.share_of_core_pct)}</span>
            </p>
            {x.isin && <p className="text-xs text-faint">{x.isin}</p>}
            <p className="mt-0.5 text-sm text-muted">{x.why}</p>
          </li>
        ))}
      </ul>
      {proposal?.reasoning && <p className="mt-3 text-sm text-muted">{proposal.reasoning}</p>}
      {proposal && <CorePlanDecision id={proposal.id} />}
    </section>
  );
}
