"use client";

import { useState, useTransition } from "react";
import { linkPayback, paybackCandidates, setCategory } from "./actions";
import type { TxnView } from "./data";
import { CATEGORIES } from "./ing-csv";

const money = (n: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n);
const signed = (n: number) => (n < 0 ? `−${money(-n)}` : `+${money(n)}`);
const shortDate = (ymd: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${ymd}T00:00:00Z`),
  );

function groupByDay(txns: TxnView[]) {
  const days = new Map<string, TxnView[]>();
  for (const t of txns) days.set(t.bookedAt, [...(days.get(t.bookedAt) ?? []), t]);
  return [...days];
}

/** Recent transactions; tap one to fix its category or its Tikkie link. */
export function TransactionList({ transactions, showAccount }: { transactions: TxnView[]; showAccount: boolean }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="mt-4 space-y-6">
      {groupByDay(transactions).map(([day, txns]) => (
        <div key={day}>
          <h3 className="text-xs text-faint">{shortDate(day)}</h3>
          <ul className="mt-1 divide-y divide-line">
            {txns.map((t) => {
              const isOpen = open === t.id;
              const isPayback = t.category === "Paybacks" && t.amount > 0;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : t.id)}
                    className="-mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-4 rounded-md px-2 py-2.5 text-left hover:bg-surface focus-visible:outline-2 focus-visible:outline-dawn"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[15px]">{t.counterparty}</span>
                      <span className="line-clamp-2 text-xs text-faint">
                        {isPayback
                          ? t.offsets
                            ? `Payback for ${t.offsets.label}`
                            : "Payback · not matched to a payment"
                          : t.category}
                        {t.paidBack > 0 && ` · ${money(t.paidBack)} paid back, your share ${money(-t.amount - t.paidBack)}`}
                        {showAccount && ` · ${t.account}`}
                      </span>
                    </span>
                    <span className={`shrink-0 tabular-nums ${t.amount > 0 && !isPayback ? "text-gain" : isPayback ? "text-muted" : ""}`}>
                      {signed(t.amount)}
                    </span>
                  </button>
                  {isOpen && (isPayback ? <PaybackEditor txn={t} /> : <CategoryEditor txn={t} onDone={() => setOpen(null)} />)}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CategoryEditor({ txn, onDone }: { txn: TxnView; onDone: () => void }) {
  const [category, setCat] = useState(txn.category);
  const [always, setAlways] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-surface px-3 py-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await setCategory(txn.id, category, always);
          if (res.ok) onDone();
          else setError(res.error);
        });
      }}
    >
      <label className="flex items-center gap-2">
        <span className="text-muted">Category</span>
        <select
          value={category}
          onChange={(e) => setCat(e.target.value)}
          className="rounded-md border border-line bg-ink px-2 py-1.5 text-text focus-visible:outline-2 focus-visible:outline-dawn"
        >
          {CATEGORIES.filter((c) => c !== "Paybacks").map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 items-center gap-2 text-muted">
        <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} className="accent-[var(--dawn)]" />
        <span className="truncate">Always for {txn.counterparty}</span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-line px-3 py-1.5 hover:bg-surface-2 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-dawn"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {error && <p className="w-full text-loss">{error}</p>}
    </form>
  );
}

function PaybackEditor({ txn }: { txn: TxnView }) {
  const [options, setOptions] = useState<{ id: string; label: string }[] | null>(null);
  const [choice, setChoice] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const res = await fn();
      setMessage(res.ok ? ok : (res.error ?? "Something went wrong."));
    });

  return (
    <div className="mb-3 space-y-3 rounded-md bg-surface px-3 py-3 text-sm">
      <p className="text-muted">
        {txn.offsets
          ? `Matched ${txn.offsets.source === "auto" ? "automatically" : "by you"} to ${txn.offsets.label}. It’s subtracted from that payment, so only your share counts as spending.`
          : txn.unlinked
            ? "You marked this as not belonging to a payment. It doesn’t count as income."
            : "Not matched yet. It doesn’t count as income either way."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {txn.offsets && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => linkPayback(txn.id, null), "Unlinked.")}
            className="rounded-md border border-line px-3 py-1.5 hover:bg-surface-2 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-dawn"
          >
            Not a match
          </button>
        )}
        {options === null ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => setOptions(await paybackCandidates(txn.id)))}
            className="rounded-md border border-line px-3 py-1.5 hover:bg-surface-2 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-dawn"
          >
            Link to a payment
          </button>
        ) : options.length ? (
          <>
            <label className="sr-only" htmlFor={`link-${txn.id}`}>
              Payment this payback belongs to
            </label>
            <select
              id={`link-${txn.id}`}
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className="min-w-0 max-w-full rounded-md border border-line bg-ink px-2 py-1.5 focus-visible:outline-2 focus-visible:outline-dawn"
            >
              <option value="">Choose a payment…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending || !choice}
              onClick={() => run(() => linkPayback(txn.id, choice), "Linked.")}
              className="rounded-md border border-line px-3 py-1.5 hover:bg-surface-2 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-dawn"
            >
              Link
            </button>
          </>
        ) : (
          <span className="text-faint">No payment in the 3 weeks before fits this amount.</span>
        )}
      </div>
      {message && <p role="status" className="text-muted">{message}</p>}
    </div>
  );
}
