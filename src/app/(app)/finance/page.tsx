import { eur } from "@/lib/format";
import { hasDatabase } from "@/lib/supabase";
import { hasBitvavo, syncBitvavo } from "@/modules/finance/bitvavo";
import { getFinance, type AccountView, type HoldingView } from "@/modules/finance/data";
import { ImportExports, RefreshBitvavo } from "@/modules/finance/ImportExports";
import { TransactionList } from "@/modules/finance/TransactionList";

export const dynamic = "force-dynamic";

const cents = (n: number) => eur(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = (ymd: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${ymd.slice(0, 10)}T00:00:00Z`));
const timeAgo = (iso: string) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return shortDate(iso);
};
const daysSince = (ymd: string) => Math.floor((Date.now() - Date.parse(`${ymd.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
const monthName = (ym: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

/** Bitvavo refreshes itself when the page opens and the last sync is over 6 hours old. */
async function freshenBitvavo(accounts: AccountView[]) {
  if (!hasDatabase() || !hasBitvavo()) return false;
  const bv = accounts.find((a) => a.provider === "bitvavo");
  if (bv?.syncedAt && Date.now() - Date.parse(bv.syncedAt) < 6 * 3_600_000) return false;
  try {
    await syncBitvavo();
    return true;
  } catch (err) {
    console.error("Bitvavo auto-sync:", err);
    return false;
  }
}

export default async function FinancePage() {
  let data = await getFinance();
  if (await freshenBitvavo(data.accounts)) data = await getFinance();
  const { accounts, holdings, transactions, month, isSample } = data;

  const bank = accounts.filter((a) => a.provider === "ing");
  const degiro = accounts.find((a) => a.provider === "degiro");
  const bitvavo = accounts.find((a) => a.provider === "bitvavo");
  const sum = (as: AccountView[]) => as.reduce((s, a) => s + (a.balance ?? 0), 0);
  const holdingsOf = (a?: AccountView) => (a ? holdings.filter((h) => h.accountId === a.id) : []);
  const invested = holdingsOf(degiro).reduce((s, h) => s + h.valueEur, 0);
  const crypto = holdingsOf(bitvavo).reduce((s, h) => s + h.valueEur, 0);
  const bankTotal = sum(bank);
  const total = bankTotal + invested + crypto;
  const ingLatest = bank.map((a) => a.latestTxn).filter(Boolean).sort().at(-1) ?? null;
  const hasAnything = accounts.length > 0;

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Finance</h1>
      <p className="mt-2 max-w-[62ch] text-muted">
        Everything you own, from your monthly exports and Bitvavo. LifeOS only reads: it can never move money or trade.
      </p>
      {isSample && (
        <p className="mt-4 inline-block rounded-md border border-line px-2.5 py-1 text-xs text-muted">
          Showing sample data. Connect Supabase to import your own.
        </p>
      )}

      <section aria-labelledby="sources" className="mt-10">
        <h2 id="sources" className="sr-only">Your data</h2>
        <ul className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
          <Source
            name="ING"
            status={ingLatest ? `Up to ${shortDate(ingLatest)}` : "No export yet"}
            stale={!ingLatest || daysSince(ingLatest) > 35}
          />
          <Source
            name="DEGIRO"
            status={degiro?.balanceAsOf ? `Portfolio of ${shortDate(degiro.balanceAsOf)}` : "No export yet"}
            stale={!degiro?.balanceAsOf || daysSince(degiro.balanceAsOf) > 35}
          />
          <Source
            name="Bitvavo"
            status={bitvavo?.syncedAt ? `Live · ${timeAgo(bitvavo.syncedAt)}` : hasBitvavo() ? "Connecting…" : "Not connected"}
            stale={!bitvavo?.syncedAt}
            action={hasBitvavo() ? <RefreshBitvavo /> : undefined}
          />
        </ul>
      </section>

      {hasAnything && (
        <section aria-labelledby="worth" className="mt-12">
          <h2 id="worth" className="text-sm text-muted">Net worth</h2>
          <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight">{eur(total)}</p>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <Part label="Bank" value={bankTotal} />
            {degiro && <Part label="Investments" value={invested} />}
            {bitvavo && <Part label="Crypto" value={crypto} />}
          </dl>
        </section>
      )}

      {hasAnything && (
        <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          {bank.length > 0 && (
            <section aria-labelledby="accounts">
              <h2 id="accounts" className="text-sm text-muted">Bank accounts</h2>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {bank.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-4 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-[15px]">{a.name}</p>
                      <p className="text-xs text-faint">
                        {a.kind === "savings" ? "Savings" : "Current account"}
                        {a.balanceAsOf && ` · balance on ${shortDate(a.balanceAsOf)}`}
                      </p>
                    </div>
                    <p className="shrink-0 tabular-nums">{a.balance === null ? "—" : cents(a.balance)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {month && (
            <section aria-labelledby="month">
              <h2 id="month" className="text-sm text-muted">{monthName(month.month)}</h2>
              <dl className="mt-2 flex gap-10">
                <div>
                  <dt className="text-xs text-faint">Spent (your share)</dt>
                  <dd className="text-2xl font-semibold tabular-nums tracking-tight">{eur(month.spent)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-faint">Came in</dt>
                  <dd className="text-2xl font-semibold tabular-nums tracking-tight text-gain">{eur(month.received)}</dd>
                </div>
              </dl>
              {month.byCategory.length > 0 && (
                <ul className="mt-6 divide-y divide-line border-y border-line">
                  {month.byCategory.slice(0, 7).map((c) => (
                    <li key={c.category} className="flex justify-between gap-4 py-2.5 text-[15px]">
                      <span>{c.category}</span>
                      <span className="tabular-nums text-muted">{eur(c.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-faint">
                Transfers between your own accounts, investing and Tikkie paybacks don’t count as spending or income.
              </p>
            </section>
          )}
        </div>
      )}

      {(holdingsOf(degiro).length > 0 || holdingsOf(bitvavo).length > 0) && (
        <section aria-labelledby="holdings" className="mt-16">
          <h2 id="holdings" className="text-sm text-muted">Investments</h2>
          <Holdings title="DEGIRO" rows={holdingsOf(degiro)} total={invested + crypto} />
          <Holdings title="Bitvavo" rows={holdingsOf(bitvavo)} total={invested + crypto} />
          <p className="mt-3 text-xs text-faint">Share of all investments (DEGIRO + Bitvavo). Analysis arrives with the portfolio analyst.</p>
        </section>
      )}

      {transactions.length > 0 && (
        <section aria-labelledby="txns" className="mt-16">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="txns" className="text-sm text-muted">Recent transactions</h2>
            <p className="text-xs text-faint">Tap one to fix its category or a Tikkie match.</p>
          </div>
          <TransactionList transactions={transactions} showAccount={bank.length > 1} />
        </section>
      )}

      <section aria-labelledby="import" className={hasAnything ? "mt-16 border-t border-line pt-8" : "mt-12"}>
        <h2 id="import" className={hasAnything ? "text-sm text-muted" : "text-lg font-medium"}>
          {hasAnything ? "Upload this month’s exports" : "Upload your exports"}
        </h2>
        <div className="mt-4">
          <ImportExports first={!hasAnything} />
        </div>
      </section>
    </>
  );
}

function Source({ name, status, stale, action }: { name: string; status: string; stale: boolean; action?: React.ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-3 bg-ink px-4 py-3">
      <div className="min-w-0">
        <p className="text-[15px]">{name}</p>
        <p className={`text-xs ${stale ? "text-dawn" : "text-faint"}`}>{status}</p>
      </div>
      {action}
    </li>
  );
}

function Part({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex gap-2">
      <dt className="text-faint">{label}</dt>
      <dd className="tabular-nums text-muted">{eur(value)}</dd>
    </div>
  );
}

function Holdings({ title, rows, total }: { title: string; rows: HoldingView[]; total: number }) {
  if (!rows.length) return null;
  return (
    <div className="mt-4">
      <h3 className="text-xs text-faint">{title}</h3>
      <ul className="mt-1 divide-y divide-line border-y border-line">
        {rows.map((h) => (
          <li key={h.symbol} className="flex items-baseline justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[15px]">{h.name}</p>
              <p className="truncate text-xs text-faint">
                {h.symbol === "CASH" ? "Cash" : `${h.symbol} · ${h.quantity.toLocaleString("nl-NL", { maximumFractionDigits: 8 })}`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tabular-nums">{eur(h.valueEur)}</p>
              <p className="text-xs tabular-nums text-faint">
                {total > 0 ? `${((h.valueEur / total) * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
