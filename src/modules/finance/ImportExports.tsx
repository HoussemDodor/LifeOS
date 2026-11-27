"use client";

import { useActionState, useState } from "react";
import { importExports, reapplyRules, refreshBitvavo, type ImportResult } from "./actions";

/** The monthly upload: ING and DEGIRO exports in one go; each file is recognised automatically. */
export function ImportExports({ first }: { first: boolean }) {
  const [result, action, pending] = useActionState<ImportResult | null, FormData>(importExports, null);
  const [chosen, setChosen] = useState<string[]>([]);

  return (
    <form action={action} className="space-y-4">
      <dl className="grid max-w-[70ch] gap-x-6 gap-y-2 text-sm sm:grid-cols-[6rem_minmax(0,1fr)]">
        <dt className="text-text">ING</dt>
        <dd className="text-muted">
          Mijn ING (website) → open an account → <span className="text-text">Af- en bijschrijvingen downloaden</span> → a
          period and a CSV format. Do this for your current and savings account.
        </dd>
        <dt className="text-text">DEGIRO</dt>
        <dd className="text-muted">
          Inbox → <span className="text-text">Portfolio</span> → Export → CSV (what you hold now), and{" "}
          <span className="text-text">Transactions</span> → pick a period → Export → CSV (your buys and sells).
        </dd>
      </dl>
      <p className="text-sm text-faint">Drop all files in at once. Overlapping periods are fine: nothing is imported twice.</p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-md border border-line px-4 py-2 text-sm hover:bg-surface focus-within:outline-2 focus-within:outline-dawn">
          {chosen.length ? "Choose other files" : "Choose CSV files"}
          <input
            type="file"
            name="files"
            accept=".csv,text/csv"
            multiple
            className="sr-only"
            onChange={(e) => setChosen([...(e.target.files ?? [])].map((f) => f.name))}
          />
        </label>
        <button
          type="submit"
          disabled={pending || !chosen.length}
          className={`rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dawn disabled:opacity-40 ${
            first ? "bg-dawn text-ink hover:opacity-90" : "border border-line hover:bg-surface"
          }`}
        >
          {pending ? "Importing…" : "Import"}
        </button>
        {chosen.length > 0 && <span className="min-w-0 truncate text-sm text-faint">{chosen.join(", ")}</span>}
      </div>

      <p role="status" className={`min-h-5 text-sm ${result?.ok === false ? "text-loss" : "text-muted"}`}>
        {result?.message}
      </p>
    </form>
  );
}

export function RefreshBitvavo() {
  const [result, action, pending] = useActionState<ImportResult | null, FormData>(() => refreshBitvavo(), null);
  return (
    <form action={action} className="inline">
      <button
        type="submit"
        disabled={pending}
        className="rounded text-sm text-muted underline-offset-4 hover:text-text hover:underline disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-dawn"
      >
        {pending ? "Refreshing…" : "Refresh"}
      </button>
      {result && (
        <span role="status" className={`ml-2 text-sm ${result.ok ? "text-faint" : "text-loss"}`}>
          {result.message}
        </span>
      )}
    </form>
  );
}

export function ReapplyRules() {
  const [result, action, pending] = useActionState<ImportResult | null, FormData>(() => reapplyRules(), null);
  return (
    <form action={action} className="inline">
      <button
        type="submit"
        disabled={pending}
        className="rounded text-xs text-muted underline-offset-4 hover:text-text hover:underline disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-dawn"
      >
        {pending ? "Re-applying…" : "Re-apply category rules"}
      </button>
      {result && (
        <span role="status" className={`ml-2 text-xs ${result.ok ? "text-faint" : "text-loss"}`}>
          {result.message}
        </span>
      )}
    </form>
  );
}
