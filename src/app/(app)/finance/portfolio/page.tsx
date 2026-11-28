import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { eur } from "@/lib/format";
import { BucketToggle } from "@/modules/finance/BucketToggle";
import type { BenchmarkResult } from "@/modules/finance/benchmark";
import { getPortfolio, POLICY, type Bucket, type PortfolioHolding, type PortfolioView } from "@/modules/finance/portfolio";

export const dynamic = "force-dynamic";

const pct = (n: number, digits = 0) =>
  `${(n * 100).toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${eur(Math.abs(n))}`;
const signedPct = (n: number) => `${n >= 0 ? "+" : "−"}${pct(Math.abs(n), 1)}`;
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).format(new Date(iso));

const PARTS: { key: "core" | "stocks" | "crypto"; bucket: Bucket; name: string; swatch: string }[] = [
  { key: "core", bucket: "core", name: "Core: index funds", swatch: "bg-viz-1" },
  { key: "stocks", bucket: "satellite", name: "Satellite: single stocks", swatch: "bg-viz-2" },
  { key: "crypto", bucket: "crypto", name: "Satellite: crypto", swatch: "bg-viz-3" },
];

export default async function PortfolioPage() {
  const p = await getPortfolio();
  const empty = p.total <= 0;

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Portfolio</h1>
      <p className="mt-2 max-w-[62ch] text-muted">
        Your investments against your own rules: {pct(POLICY.core)} core, {pct(POLICY.satellite)} satellite, crypto at most{" "}
        {pct(POLICY.cryptoCap)}. LifeOS only reads; every trade is yours to make.
      </p>
      {p.isSample && (
        <p className="mt-4 inline-block rounded-md border border-line px-2.5 py-1 text-xs text-muted">
          Showing an example portfolio. Yours appears once your DEGIRO export is uploaded.
        </p>
      )}

      {empty ? (
        <section className="mt-10 max-w-[62ch] border-t border-line pt-8">
          <h2 className="text-lg font-medium">No investments in LifeOS yet</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted marker:text-faint">
            <li>
              In DEGIRO, export <span className="text-text">Portfolio</span> and <span className="text-text">Transactions</span>{" "}
              (from your first trade) as CSV.
            </li>
            <li>
              Upload both on{" "}
              <Link href="/finance" className="text-dawn underline-offset-4 hover:underline">
                Finance
              </Link>
              .
            </li>
            <li>Optional: add a Bitvavo API key with View permission only, so crypto syncs on its own.</li>
          </ol>
        </section>
      ) : (
        <>
          <section aria-labelledby="total" className="mt-10">
            <h2 id="total" className="text-sm text-muted">Worth now</h2>
            <p className="mt-1 text-5xl font-semibold tracking-tight">{eur(p.total)}</p>
            {p.result && (
              <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
                <Stat label="You put in" value={eur(p.result.putIn)} />
                <Stat
                  label="Gain"
                  value={`${signed(p.result.gain)} (${signedPct(p.result.gain / p.result.putIn)})`}
                  tone={p.result.gain >= 0 ? "gain" : "loss"}
                />
                <Stat
                  label={`Trading costs, ${p.result.trades} trades`}
                  value={`${eur(p.result.fees, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} (${pct(p.result.fees / p.result.putIn, 1)})`}
                />
              </dl>
            )}
            {p.result && (
              <p className="mt-2 text-xs text-faint">
                Price gain on what you hold now, after fees and currency exchange. Dividends paid out to cash aren’t included.
              </p>
            )}
            <p className="mt-2 text-xs text-faint">
              {[
                p.asOf.degiro && `DEGIRO export of ${shortDate(p.asOf.degiro)}`,
                p.asOf.bitvavo && `Bitvavo ${shortDate(p.asOf.bitvavo)}`,
                p.cash >= 1 && `plus ${eur(p.cash)} uninvested cash, not counted`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </section>

          {p.result && p.benchmark && <Benchmark you={p.result} b={p.benchmark} />}

          <section aria-labelledby="split" className="mt-10 max-w-3xl">
            <h2 id="split" className="text-sm text-muted">Split</h2>
            <SplitBar parts={p.parts} total={p.total} />
            <TargetBar />

            <ul className="mt-6 space-y-3" aria-label="How your portfolio compares with your rules">
              {p.flags.map((f) => (
                <li key={f.text} className="flex max-w-[62ch] items-start gap-2.5">
                  {f.kind === "trim" || f.kind === "crypto" ? (
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-dawn" aria-label="Needs attention" />
                  ) : (
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-faint" aria-hidden="true" />
                  )}
                  <p className={f.kind === "trim" || f.kind === "crypto" ? "text-text" : "text-muted"}>{f.text}</p>
                </li>
              ))}
            </ul>

            <dl className="mt-8 divide-y divide-line border-y border-line text-[15px]">
              <Rule label="Core" target={`${pct(POLICY.core)} target`} now={pct(p.shares.core)} />
              <Rule label="Satellite" target={`${pct(POLICY.satellite)} target, trim only above ${pct(POLICY.trimAbove)}`} now={pct(p.shares.satellite)} alert={p.shares.satellite > POLICY.trimAbove} />
              <Rule label="Crypto" target={`at most ${pct(POLICY.cryptoCap)} of everything`} now={pct(p.shares.crypto, 1)} alert={p.shares.crypto > POLICY.cryptoCap} />
            </dl>
          </section>

          <section aria-labelledby="holdings" className="mt-14 max-w-3xl">
            <h2 id="holdings" className="text-sm text-muted">Holdings</h2>
            <p className="mt-1 text-xs text-faint">
              LifeOS guessed the core and satellite groups: broad index funds are core, single stocks and sector funds are
              satellite. Move anything it got wrong.
            </p>
            {PARTS.map((part) => (
              <HoldingGroup key={part.key} title={part.name} swatch={part.swatch} rows={p.holdings.filter((h) => h.bucket === part.bucket)} />
            ))}
          </section>
        </>
      )}

      <p className="mt-14 max-w-[62ch] text-xs text-faint">
        Analysis against your own rules, not licensed financial advice. LifeOS never places trades. The Analyst tab has the
        monthly review: stock checks with sources, fund costs and overlap.
      </p>
    </>
  );
}

/** Tall segmented bar: one whole, split into core, single stocks and crypto. */
function SplitBar({ parts, total }: { parts: { core: number; stocks: number; crypto: number }; total: number }) {
  const blocks = PARTS.map((p) => ({ ...p, value: parts[p.key], share: total ? parts[p.key] / total : 0 })).filter((b) => b.value > 0);
  const label = blocks.map((b) => `${b.name} ${pct(b.share)} (${eur(b.value)})`).join(", ");
  return (
    <div className="mt-3">
      <div role="img" aria-label={`Split: ${label}`} className="flex h-7 gap-[2px]">
        {blocks.map((b) => (
          <div
            key={b.key}
            title={`${b.name}: ${eur(b.value)} (${pct(b.share)})`}
            className={`flex min-w-[3px] items-center overflow-hidden rounded-[4px] px-2 ${b.swatch}`}
            style={{ flexGrow: b.share, flexBasis: 0 }}
          >
            {b.share >= 0.09 && <span className="text-xs font-medium text-white">{pct(b.share)}</span>}
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
        {blocks.map((b) => (
          <li key={b.key} className="flex items-center gap-2">
            <span className={`size-2.5 rounded-sm ${b.swatch}`} aria-hidden="true" />
            <span className="text-muted">{b.name}</span>
            <span className="tabular-nums text-text">{eur(b.value)}</span>
            {b.share < 0.09 && <span className="tabular-nums text-faint">{pct(b.share, 1)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Thin bar showing the target split, for comparison. */
function TargetBar() {
  return (
    <div className="mt-5">
      <p className="text-xs text-faint">Your target</p>
      <div className="mt-1.5 flex h-2 gap-[2px]" aria-hidden="true">
        <div className="rounded-full bg-viz-1/60" style={{ flexGrow: POLICY.core, flexBasis: 0 }} />
        <div className="rounded-full bg-viz-2/60" style={{ flexGrow: POLICY.satellite, flexBasis: 0 }} />
      </div>
      <p className="mt-1.5 flex justify-between text-xs text-faint">
        <span>Core {pct(POLICY.core)}</span>
        <span>Satellite {pct(POLICY.satellite)}</span>
      </p>
    </div>
  );
}

function Rule({ label, target, now, alert }: { label: string; target: string; now: string; alert?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt>
        {label} <span className="text-sm text-faint">· {target}</span>
      </dt>
      <dd className={`shrink-0 tabular-nums ${alert ? "text-dawn" : "text-text"}`}>{now}</dd>
    </div>
  );
}

function HoldingGroup({ title, swatch, rows }: { title: string; swatch: string; rows: PortfolioHolding[] }) {
  if (!rows.length) return null;
  return (
    <div className="mt-6">
      <h3 className="flex items-center gap-2 text-xs text-faint">
        <span className={`size-2 rounded-sm ${swatch}`} aria-hidden="true" />
        {title}
      </h3>
      <ul className="mt-1.5 divide-y divide-line border-y border-line">
        {rows.map((h) => (
          <li key={h.symbol} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div className="min-w-0 flex-1 basis-48">
              <p className="truncate text-[15px]">{h.name}</p>
              <p className="truncate text-xs text-faint">
                {h.symbol}
                {h.guessed && " · LifeOS’s guess"}
              </p>
            </div>
            {h.movable && h.bucket !== "crypto" && <BucketToggle symbol={h.symbol} name={h.name} bucket={h.bucket} />}
            <div className="ml-auto w-28 shrink-0 text-right" title={h.putIn !== null ? `Put in ${eur(h.putIn)}, gain ${signed(h.gain!)}` : undefined}>
              <p className="tabular-nums">{eur(h.valueEur)}</p>
              <p className="text-xs tabular-nums text-faint">
                {h.gain !== null && h.putIn ? (
                  <span className={h.gain >= 0 ? "text-gain" : "text-loss"}>{signedPct(h.gain / h.putIn)}</span>
                ) : null}
                {h.gain !== null && h.putIn ? " · " : ""}
                {pct(h.share, 1)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" }) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className={`text-lg font-medium tabular-nums ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : ""}`}>{value}</dd>
    </div>
  );
}

/**
 * You vs the same euros in an all-world fund, on the same days. Two bars on
 * one scale, with a tick where the money you put in sits, so the gain on
 * each side reads as the distance past that tick.
 */
function Benchmark({ you, b }: { you: NonNullable<PortfolioView["result"]>; b: BenchmarkResult }) {
  const diff = you.worth - b.value;
  const max = Math.max(you.worth, b.value, you.putIn) * 1.04;
  const rows = [
    { label: "Your picks", value: you.worth, gain: you.gain / you.putIn, bar: "bg-text/80" },
    { label: "All-world instead", value: b.value, gain: b.gainPct / 100, bar: "bg-muted/45" },
  ];
  return (
    <section aria-labelledby="bench" className="mt-10 max-w-3xl">
      <h2 id="bench" className="text-sm text-muted">Against an all-world fund</h2>
      <p className="mt-2 max-w-[62ch] text-[15px]">
        {Math.abs(diff) < 50
          ? "You’re level with "
          : diff > 0
            ? <>You’re <span className="font-semibold text-gain">{eur(diff)} ahead</span> of </>
            : <>You’re <span className="font-semibold text-loss">{eur(-diff)} behind</span> </>}
        putting the same euros, on the same days, into {b.name}.
      </p>
      <div className="mt-5">
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
              <span className="text-sm text-muted">{r.label}</span>
              <span className="relative block" aria-hidden="true">
                <span className={`block h-3 rounded-r-[4px] ${r.bar}`} style={{ width: `${(r.value / max) * 100}%` }} />
                {/* Where the money you put in sits on this scale */}
                <span className="absolute -inset-y-1 w-0.5 rounded-full bg-dawn" style={{ left: `${(you.putIn / max) * 100}%` }} />
              </span>
              <span className="min-w-[8.5rem] text-right text-sm tabular-nums">
                {eur(r.value)}{" "}
                <span className={r.gain >= 0 ? "text-gain" : "text-loss"}>{signedPct(r.gain)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-3 text-xs text-faint">
        The gold mark is the {eur(you.putIn)} you put in. All-world price of {shortDate(b.priceDate)}, valued on the same day as your DEGIRO
        export. Your S&amp;P 500 fund pays dividends out to cash, which isn’t counted here; the all-world fund reinvests them.
      </p>
    </section>
  );
}
