"use client";

import { useState, useTransition } from "react";
import { decideCorePlan, startAnalysis } from "./analyst-actions";

const primary =
  "rounded-md bg-dawn px-4 py-2 text-sm font-medium text-ink hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dawn";
const quiet =
  "rounded-md border border-line px-3 py-1.5 text-sm hover:bg-surface disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-dawn";

export function RunAnalysis({ label, disabled }: { label: string; disabled: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={disabled || pending}
        className={primary}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await startAnalysis();
            if (!res.ok) setError(res.error);
          })
        }
      >
        {pending ? "Starting…" : label}
      </button>
      <span className="text-sm text-faint">Researches every holding on the web. Takes 2–4 minutes and costs about US$ 1.</span>
      {error && (
        <p role="status" className="w-full text-sm text-loss">
          {error}
        </p>
      )}
    </div>
  );
}

export function CorePlanDecision({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const decide = (accept: boolean) =>
    start(async () => {
      const res = await decideCorePlan(id, accept);
      if (!res.ok) setError(res.error);
    });
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => decide(true)} className={primary}>
        Make this my core
      </button>
      <button type="button" disabled={pending} onClick={() => decide(false)} className={quiet}>
        Not now
      </button>
      {error && <p className="w-full text-sm text-loss">{error}</p>}
    </div>
  );
}
