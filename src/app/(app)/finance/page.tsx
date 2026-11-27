import { eur } from "@/lib/format";
import { getFinance, type TxnView } from "@/modules/finance/data";
import { ImportIng } from "@/modules/finance/ImportIng";

export const dynamic = "force-dynamic";

const cents = (n: number) => eur(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n: number) => (n < 0 ? `−${cents(-n)}` : `+${cents(n)}`);
const shortDate = (ymd: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${ymd}T00:00:00Z`),
  );
const monthName = (ym: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

const later = [
  { name: "DEGIRO", kind: "Investment portfolio", how: "Portfolio CSV upload. Next step." },
  { name: "Bitvavo", kind: "Crypto", how: "Read-only API key with only the View permission." },
];

function groupByDay(txns: TxnView[]) {
  const days = new Map<string, TxnView[]>();
  for (const t of txns) days.set(t.bookedAt, [...(days.get(t.bookedAt) ?? []), t]);
  return [...days];
}

export default async function FinancePage() {
  const { accounts, transactions, month, isSample } = await getFinance();
  const total = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  const hasData = accounts.length > 0;

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Finance</h1>
      <p className="mt-2 max-w-[60ch] text-muted">
        Your ING accounts from CSV exports. LifeOS only reads: it can never move money.
      </p>
      {isSample && (
        <p className="mt-4 inline-block rounded-md border border-line px-2.5 py-1 text-xs text-muted">
          Showing sample data. Connect Supabase to import your own.
        </p>
      )}

      {hasData ? (
        <>
          <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <section aria-labelledby="accounts">
              <h2 id="accounts" className="text-sm text-muted">On ING</h2>
              <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight">{eur(total)}</p>
              <ul className="mt-6 divide-y divide-line border-y border-line">
                {accounts.map((a) => (
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

            {month && (
              <section aria-labelledby="month">
                <h2 id="month" className="text-sm text-muted">{monthName(month.month)}</h2>
                <dl className="mt-2 flex gap-10">
                  <div>
                    <dt className="text-xs text-faint">Spent</dt>
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
                <p className="mt-3 text-xs text-faint">Transfers between your own accounts and investing don’t count as spending.</p>
              </section>
            )}
          </div>

          <section aria-labelledby="txns" className="mt-16">
            <h2 id="txns" className="text-sm text-muted">Recent transactions</h2>
            <div className="mt-4 space-y-6">
              {groupByDay(transactions).map(([day, txns]) => (
                <div key={day}>
                  <h3 className="text-xs text-faint">{shortDate(day)}</h3>
                  <ul className="mt-1 divide-y divide-line">
                    {txns.map((t) => (
                      <li key={t.id} className="flex items-baseline justify-between gap-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-[15px]">{t.counterparty}</p>
                          <p className="truncate text-xs text-faint">
                            {t.category}
                            {accounts.length > 1 && ` · ${t.account}`}
                          </p>
                        </div>
                        <p className={`shrink-0 tabular-nums ${t.amount > 0 ? "text-gain" : ""}`}>{signed(t.amount)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="import" className="mt-16 border-t border-line pt-8">
            <h2 id="import" className="text-sm text-muted">Import newer transactions</h2>
            <div className="mt-4">
              <ImportIng first={false} />
            </div>
          </section>
        </>
      ) : (
        <section aria-labelledby="import" className="mt-12">
          <h2 id="import" className="text-lg font-medium">Import your ING transactions</h2>
          <div className="mt-4">
            <ImportIng first />
          </div>
        </section>
      )}

      <ul className="mt-16 divide-y divide-line border-y border-line">
        {later.map((s) => (
          <li key={s.name} className="grid gap-1 py-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-8">
            <div>
              <p>{s.name}</p>
              <p className="text-xs text-faint">{s.kind}</p>
            </div>
            <p className="text-sm text-muted">{s.how}</p>
            <span className="text-sm text-faint">Not connected</span>
          </li>
        ))}
      </ul>
    </>
  );
}
