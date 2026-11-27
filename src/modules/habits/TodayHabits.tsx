"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import type { HabitView } from "./types";
import { useHabitDays } from "./useHabitDays";

export const streakLabel = (n: number) => (n === 0 ? "No streak yet" : `${n}-day streak`);

/** Today's habits on the Today screen: one tick per habit. */
export function TodayHabits({ habits: initial, today }: { habits: HabitView[]; today: string }) {
  const { habits, toggle, error } = useHabitDays(initial, today);

  if (!habits.length) {
    return (
      <p className="mt-4 text-muted">
        No habits yet.{" "}
        <Link href="/habits" className="text-dawn underline-offset-4 hover:underline">
          Add your first
        </Link>
      </p>
    );
  }

  return (
    <>
      <ul className="mt-4 space-y-1">
        {habits.map((h) => {
          const done = h.done.includes(today);
          return (
            <li key={h.id}>
              <label className="-mx-2 flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-surface">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={done}
                  onChange={(e) => toggle(h.id, today, e.target.checked)}
                />
                <span
                  aria-hidden="true"
                  className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-dawn peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-ink ${
                    done ? "border-dawn bg-dawn text-ink" : "border-faint"
                  }`}
                >
                  {done && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-snug">{h.name}</span>
                  <span className="block text-xs tabular-nums text-faint">{streakLabel(h.current)}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="status" className="mt-3 text-sm text-loss">
          {error}
        </p>
      )}
    </>
  );
}
