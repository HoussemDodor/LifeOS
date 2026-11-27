import "server-only";
import { db, hasDatabase } from "@/lib/supabase";
import { amsterdamYmd, bestStreak, currentStreak, lastDays } from "./streak";
import type { HabitView } from "./types";

/** Days shown in the history strip (12 weeks). */
export const HISTORY_DAYS = 84;

export interface HabitsData {
  today: string;
  habits: HabitView[];
  isSample: boolean;
}

function toView(id: string, name: string, done: Set<string>, today: string): HabitView {
  const window = new Set(lastDays(today, HISTORY_DAYS));
  return {
    id,
    name,
    done: [...done].filter((d) => window.has(d)).sort(),
    current: currentStreak(done, today),
    best: bestStreak(done),
  };
}

function sample(today: string): HabitView[] {
  const days = lastDays(today, HISTORY_DAYS);
  const pick = (every: number) => new Set(days.filter((_, i) => i % every !== 0 && i < days.length - 1));
  return [
    toView("s1", "Read 20 pages", pick(4), today),
    toView("s2", "No phone in bed", pick(3), today),
    toView("s3", "Walk 8,000 steps", pick(7), today),
  ];
}

export async function getHabits(now = new Date()): Promise<HabitsData> {
  const today = amsterdamYmd(now);
  if (!hasDatabase()) return { today, habits: sample(today), isSample: true };

  const { data: habits, error } = await db()
    .from("habits")
    .select("id,name")
    .is("archived_at", null)
    .order("sort")
    .order("created_at");
  if (error) throw new Error(`habits: ${error.message}`);
  if (!habits.length) return { today, habits: [], isSample: false };

  const { data: checks, error: e2 } = await db()
    .from("habit_checks")
    .select("habit_id,day")
    .in("habit_id", habits.map((h) => h.id))
    .lte("day", today);
  if (e2) throw new Error(`habit_checks: ${e2.message}`);

  const byHabit = new Map<string, Set<string>>(habits.map((h) => [h.id, new Set()]));
  for (const c of checks) byHabit.get(c.habit_id)?.add(c.day);

  return { today, habits: habits.map((h) => toView(h.id, h.name, byHabit.get(h.id)!, today)), isSample: false };
}
