"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decidePromise, decideTarget, startCheckin, undoChange } from "./checkin-actions";
import type { PromiseView } from "./checkin-data";

const money = (n: number, digits = 0) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

const btn =
  "rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-dawn";

export function RunCheckin({ month, disabled, label }: { month: string; disabled: boolean; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await startCheckin();
            if (!res.ok) setError(res.error);
          })
        }
        className="rounded-md bg-dawn px-4 py-2 text-sm font-medium text-ink hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dawn"
      >
        {pending ? "Starting…" : label}
      </button>
      <span className="text-sm text-faint">Reviews {month}. Takes 1–3 minutes and costs well under € 0,50.</span>
      {error && (
        <p role="status" className="w-full text-sm text-loss">
          {error}
        </p>
      )}
    </div>
  );
}

/** While a check-in runs, refresh the page every few seconds until the report is there. */
export function WaitForReport() {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    const poll = setInterval(() => router.refresh(), 4000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [router]);
  return (
    <p role="status" className="flex items-center gap-3 text-muted">
      <span className="size-2 animate-pulse rounded-full bg-dawn" aria-hidden="true" />
      The coach is going through your transactions… {seconds > 5 && <span className="tabular-nums text-faint">{seconds}s</span>}
    </p>
  );
}

export function TargetProposal({ id, amount, reasoning }: { id: string; amount: number; reasoning: string | null }) {
  const [value, setValue] = useState(String(Math.round(amount)));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (a: number | null) =>
    start(async () => {
      const res = await decideTarget(id, a);
      if (!res.ok) setError(res.error);
    });
  return (
    <div className="rounded-md border border-dawn/40 px-4 py-4">
      <p className="text-sm text-muted">Proposed savings target</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{money(amount)} a month</p>
      {reasoning && <p className="mt-2 max-w-[60ch] text-sm text-muted">{reasoning}</p>}
      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          decide(Number(value.replace(",", ".")));
        }}
      >
        <label htmlFor="target" className="text-sm text-muted">
          My target
        </label>
        <span className="flex items-center rounded-md border border-line bg-surface px-2 focus-within:outline-2 focus-within:outline-dawn">
          <span className="text-faint">€</span>
          <input
            id="target"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-24 bg-transparent px-1.5 py-1.5 tabular-nums outline-none"
          />
        </span>
        <button type="submit" disabled={pending} className="rounded-md bg-dawn px-3 py-1.5 text-sm font-medium text-ink hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dawn">
          Set target
        </button>
        <button type="button" disabled={pending} onClick={() => decide(null)} className={btn}>
          Not now
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-loss">{error}</p>}
    </div>
  );
}

export function NewPromises({ promises }: { promises: PromiseView[] }) {
  const [pending, start] = useTransition();
  return (
    <ul className="divide-y divide-line border-y border-line">
      {promises.map((p) => (
        <li key={p.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3.5">
          <div className="min-w-0 flex-1 basis-64">
            <p className="text-[15px]">{p.text}</p>
            <p className="mt-0.5 text-xs text-faint">Checked by: {p.measure}</p>
          </div>
          {p.status === "proposed" ? (
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={() => start(async () => void (await decidePromise(p.id, true)))} className={`${btn} border-dawn/60 text-dawn`}>
                I’m in
              </button>
              <button type="button" disabled={pending} onClick={() => start(async () => void (await decidePromise(p.id, false)))} className={btn}>
                Skip
              </button>
            </div>
          ) : (
            <span className={`text-sm ${p.status === "accepted" ? "text-dawn" : "text-faint"}`}>
              {p.status === "accepted" ? "Accepted" : "Skipped"}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function UndoChange({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(async () => void (await undoChange(id)))} className="rounded text-sm text-muted underline-offset-4 hover:text-text hover:underline disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-dawn">
      Undo
    </button>
  );
}
