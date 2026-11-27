"use client";

import { useState, useTransition } from "react";
import { setBucket } from "./portfolio-actions";

/** Core / Satellite switch for one DEGIRO holding. */
export function BucketToggle({ symbol, name, bucket }: { symbol: string; name: string; bucket: "core" | "satellite" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const pick = (b: "core" | "satellite") =>
    b !== bucket &&
    start(async () => {
      const res = await setBucket(symbol, b);
      setError(!res.ok);
    });
  return (
    <span role="group" aria-label={`Group for ${name}`} className="inline-flex rounded-md border border-line p-0.5 text-xs">
      {(["core", "satellite"] as const).map((b) => (
        <button
          key={b}
          type="button"
          aria-pressed={bucket === b}
          disabled={pending}
          onClick={() => pick(b)}
          className={`rounded px-2 py-1 focus-visible:outline-2 focus-visible:outline-dawn disabled:opacity-50 ${
            bucket === b ? "bg-surface-2 text-text" : "text-faint hover:text-muted"
          }`}
        >
          {b === "core" ? "Core" : "Satellite"}
        </button>
      ))}
      {error && <span className="sr-only" role="status">Couldn’t save that.</span>}
    </span>
  );
}
