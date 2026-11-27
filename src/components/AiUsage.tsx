const usd = (n: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export interface AiUsageProps {
  costUsd: number;
  capUsd: number | null;
  calls: number;
  tokens: number;
  breakdown: { label: string; costUsd: number; calls: number }[];
}

/** This month's Claude spend vs the cap (requirement P11). Sidebar on desktop, a small pill on phones. */
export function AiUsage({ costUsd, capUsd, calls, tokens, breakdown }: AiUsageProps) {
  const share = capUsd ? Math.min(1, costUsd / capUsd) : 0;
  const high = share >= 0.8;
  const detail = breakdown.length
    ? breakdown.map((b) => `${b.label}: ${usd(b.costUsd)} (${b.calls}×)`).join("\n")
    : "No AI calls yet this month";

  return (
    <>
      <div title={detail} className="hidden px-2 pb-3 md:block">
        <p className="text-xs text-faint">AI this month</p>
        <p className="mt-0.5 text-sm tabular-nums">
          <span className={high ? "text-loss" : "text-text"}>{usd(costUsd)}</span>
          {capUsd && <span className="text-faint"> of {usd(capUsd)}</span>}
        </p>
        {capUsd && (
          <div
            role="meter"
            aria-label="AI spend this month"
            aria-valuemin={0}
            aria-valuemax={capUsd}
            aria-valuenow={Math.round(costUsd * 100) / 100}
            className="mt-1.5 h-1 overflow-hidden rounded-full bg-line"
          >
            <div className={`h-full rounded-full ${high ? "bg-loss" : "bg-muted"}`} style={{ width: `${Math.max(share * 100, costUsd > 0 ? 2 : 0)}%` }} />
          </div>
        )}
        <p className="mt-1.5 text-xs tabular-nums text-faint">
          {calls ? `${compact(tokens)} tokens · ${calls} call${calls === 1 ? "" : "s"}` : "No calls yet"}
        </p>
      </div>

      <span
        title={detail}
        className={`flex shrink-0 items-center rounded-md px-2 py-1.5 text-xs tabular-nums md:hidden ${high ? "text-loss" : "text-faint"}`}
      >
        AI {usd(costUsd)}
        {capUsd && ` / ${usd(capUsd)}`}
      </span>
    </>
  );
}
