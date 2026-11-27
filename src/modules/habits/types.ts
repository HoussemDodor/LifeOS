export interface HabitView {
  id: string;
  name: string;
  /** Done days (YYYY-MM-DD) within the history window, oldest first. */
  done: string[];
  current: number;
  best: number;
}

export type HabitActionResult = { ok: true } | { ok: false; error: string };

/** How many days back (including today) you can still tick a habit. */
export const EDITABLE_DAYS = 7;
