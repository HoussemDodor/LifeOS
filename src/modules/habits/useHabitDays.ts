"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setHabitDay } from "./actions";
import { bestStreak, currentStreak } from "./streak";
import type { HabitView } from "./types";

type Change = { habitId: string; day: string; done: boolean };

/** Habit ticks with an instant (optimistic) update and an error message if saving fails. */
export function useHabitDays(habits: HabitView[], today: string) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimistic, apply] = useOptimistic(habits, (state, c: Change) =>
    state.map((h) => {
      if (h.id !== c.habitId) return h;
      const done = new Set(h.done);
      if (c.done) done.add(c.day);
      else done.delete(c.day);
      // Shift the server's streaks by however much this tick changes them within the visible window.
      const before = new Set(h.done);
      const current = h.current + currentStreak(done, today) - currentStreak(before, today);
      const best = Math.max(h.best + bestStreak(done) - bestStreak(before), current);
      return { ...h, done: [...done].sort(), current, best };
    }),
  );

  function toggle(habitId: string, day: string, done: boolean) {
    setError(null);
    startTransition(async () => {
      apply({ habitId, day, done });
      const res = await setHabitDay(habitId, day, done);
      if (!res.ok) setError(res.error);
    });
  }

  return { habits: optimistic, toggle, error };
}
