"use client";

import { useActionState, useRef, useState } from "react";
import { importIngCsv, type ImportResult } from "./actions";

/** Upload one or more ING CSV exports. */
export function ImportIng({ first }: { first: boolean }) {
  const [result, action, pending] = useActionState<ImportResult | null, FormData>(importIngCsv, null);
  const [chosen, setChosen] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  return (
    <form action={action} className="space-y-4">
      <ol className="max-w-[62ch] list-decimal space-y-1 pl-5 text-sm text-muted marker:text-faint">
        <li>
          In Mijn ING (website), open an account and choose <span className="text-text">Af- en bijschrijvingen downloaden</span>.
        </li>
        <li>
          Pick a period and a <span className="text-text">CSV</span> format (comma or semicolon both work), then download. Do
          the same for your savings account if you like.
        </li>
        <li>Upload the files here. Overlapping periods are fine: nothing is imported twice.</li>
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-md border border-line px-4 py-2 text-sm hover:bg-surface focus-within:outline-2 focus-within:outline-dawn">
          {chosen.length ? "Choose other files" : "Choose CSV files"}
          <input
            ref={input}
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
