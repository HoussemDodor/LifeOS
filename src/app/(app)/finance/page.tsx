const sources = [
  {
    name: "ING",
    kind: "Current and savings accounts",
    how: "Live through Enable Banking (PSD2, read-only, re-consent every 180 days). Fallback: upload a CAMT.053 or CSV export from the ING app.",
  },
  {
    name: "DEGIRO",
    kind: "Investment portfolio",
    how: "Upload the Portfolio and Transactions CSV exports. Prices refresh daily from a market data API.",
  },
  {
    name: "Bitvavo",
    kind: "Crypto",
    how: "Read-only API key with only the 'View' permission. Balances sync hourly.",
  },
];

export default function FinancePage() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Finance</h1>
      <p className="mt-2 max-w-[60ch] text-muted">
        Net worth, transactions and holdings across your accounts. LifeOS only reads; it can never move money.
      </p>

      <ul className="mt-12 divide-y divide-line border-y border-line">
        {sources.map((s) => (
          <li key={s.name} className="grid gap-2 py-6 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-8">
            <div>
              <p className="text-lg">{s.name}</p>
              <p className="text-sm text-faint">{s.kind}</p>
            </div>
            <p className="max-w-[60ch] text-sm text-muted">{s.how}</p>
            <span className="text-sm text-faint">Not connected</span>
          </li>
        ))}
      </ul>
    </>
  );
}
