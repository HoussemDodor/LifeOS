"use client";

import { useState } from "react";
import type { Card } from "./coach-cards";

/**
 * Visual cards under a coach answer. One series per card, so no legend: bars
 * are neutral and the one row the answer is about wears the accent. Text stays
 * in text colours; the numbers all come from LifeOS's own lookups.
 */

const money = (n: number) =>
  new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
const compact = (n: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const monthShort = (ym: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));
const monthLong = (ym: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

/** A clean axis maximum (100, 150, 200, 250, 500…) just above the largest value. */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * p >= v) ?? 10) * p;
}

export function CoachCard({ card }: { card: Card }) {
  return (
    <figure className="max-w-[36rem] rounded-md border border-line px-4 pb-4 pt-3">
      <figcaption className="text-sm text-muted">{card.title}</figcaption>
      <div className="mt-3">
        {card.kind === "months" ? <Months card={card} /> : card.kind === "ranking" ? <Ranking card={card} /> : <List card={card} />}
      </div>
    </figure>
  );
}

function Ranking({ card }: { card: Card }) {
  const max = Math.max(...card.rows.map((r) => r.value), 0) || 1;
  return (
    <ul className="space-y-1">
      {card.rows.map((r) => {
        const hi = r.label === card.highlight;
        return (
          <li key={r.label} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-3 py-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto]">
            <span className={`truncate text-sm ${hi ? "text-text" : "text-muted"}`} title={r.label}>
              {r.label}
            </span>
            <span className="block min-w-0" aria-hidden="true">
              <span
                className={`block h-2.5 rounded-r-[4px] ${hi ? "bg-dawn" : "bg-muted/45"}`}
                style={{ width: `${(r.value / max) * 100}%`, minWidth: 2 }}
              />
            </span>
            <span className="min-w-[4.5rem] text-right text-sm tabular-nums text-text">{money(r.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Months({ card }: { card: Card }) {
  const [hover, setHover] = useState<number | null>(null);
  const rows = card.rows;
  const top = niceMax(Math.max(...rows.map((r) => r.value)));
  const maxIdx = rows.reduce((b, r, i) => (r.value > rows[b].value ? i : b), 0);
  // Label sparingly: the highlight and the peak, plus the latest month when it has room.
  const labelled = new Set([maxIdx, rows.findIndex((r) => r.label === card.highlight)].filter((i) => i >= 0));
  const last = rows.length - 1;
  if (![...labelled].some((i) => Math.abs(i - last) <= 1)) labelled.add(last);
  const H = 128; // plot height in px
  const active = hover ?? null;

  return (
    <div>
      <div className="relative" onMouseLeave={() => setHover(null)}>
        {/* Gridlines: baseline + half + top, hairline and recessive */}
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="pointer-events-none absolute inset-x-0 flex items-center gap-2" style={{ top: 18 + (1 - f) * H }}>
            <span className="w-9 shrink-0 -translate-y-1/2 text-right text-[11px] tabular-nums text-faint">{compact(top * f)}</span>
            <span className="h-px flex-1 -translate-y-1/2 bg-line" />
          </div>
        ))}

        <ol className="relative ml-11 flex items-end gap-[2px]" style={{ height: H + 18, paddingTop: 18 }} aria-hidden="true">
          {rows.map((r, i) => {
            const hi = r.label === card.highlight;
            const h = Math.max(2, (r.value / top) * H);
            return (
              <li
                key={r.label}
                className="relative flex h-full flex-1 items-end justify-center"
                onMouseEnter={() => setHover(i)}
              >
                {labelled.has(i) && hover === null && (
                  <span className="absolute whitespace-nowrap text-[11px] tabular-nums text-muted" style={{ bottom: h + 4 }}>
                    {compact(r.value)}
                  </span>
                )}
                <span
                  className={`block w-full max-w-6 rounded-t-[4px] transition-opacity ${hi ? "bg-dawn" : "bg-muted/45"} ${
                    active !== null && active !== i ? "opacity-50" : ""
                  }`}
                  style={{ height: h }}
                />
              </li>
            );
          })}
        </ol>

        {active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface-2 px-2.5 py-1 text-xs shadow-lg"
            style={{ left: `calc(2.75rem + (100% - 2.75rem) * ${(active + 0.5) / rows.length})` }}
          >
            <span className="text-muted">{monthLong(rows[active].label)}</span>{" "}
            <span className="tabular-nums text-text">{money(rows[active].value)}</span>
          </div>
        )}
      </div>

      <ol className="ml-11 mt-1.5 flex gap-[2px]" aria-hidden="true">
        {rows.map((r, i) => (
          <li key={r.label} className="flex-1 text-center text-[11px] text-faint">
            {rows.length <= 12 || i % 2 === rows.length % 2 ? monthShort(r.label).slice(0, 3) : ""}
          </li>
        ))}
      </ol>

      {/* The same numbers as a table, for screen readers */}
      <table className="sr-only">
        <caption>{card.title}</caption>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{monthLong(r.label)}</th>
              <td>{money(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function List({ card }: { card: Card }) {
  return (
    <div>
      <ul className="divide-y divide-line">
        {card.rows.map((r) => {
          const hi = r.label === card.highlight;
          return (
            <li key={r.label} className="flex items-baseline justify-between gap-4 py-2">
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[15px]">
                  {hi && <span className="size-2 shrink-0 rounded-full bg-dawn" aria-hidden="true" />}
                  <span className="truncate">{r.label}</span>
                </span>
                {r.note && <span className={`block text-xs ${hi ? "text-muted" : "text-faint"} ${hi ? "pl-4" : ""}`}>{r.note}</span>}
              </span>
              <span className="shrink-0 text-sm tabular-nums">{money(r.value)}</span>
            </li>
          );
        })}
      </ul>
      {card.total && (
        <p className="flex items-baseline justify-between gap-4 border-t border-line pt-2.5 text-sm">
          <span className="text-muted">{card.total.label}</span>
          <span className="font-semibold tabular-nums">{money(card.total.value)}</span>
        </p>
      )}
    </div>
  );
}
