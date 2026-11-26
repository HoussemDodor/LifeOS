import schedule from "./schedule.json";

export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface Workout {
  session: string;
  focus: string;
  start: string; // "HH:MM", Europe/Amsterdam
  end: string;
}

const days = schedule.days as Record<Weekday, Workout | null>;

/** Monday-first weekday in Amsterdam for a given moment. */
export function weekdayOf(d: Date): Weekday {
  const name = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: schedule.timezone }).format(d).toLowerCase();
  return name as Weekday;
}

export function workoutOn(d: Date): Workout | null {
  return days[weekdayOf(d)] ?? null;
}

export function weekPlan(): { day: Weekday; workout: Workout | null }[] {
  return WEEKDAYS.map((day) => ({ day, workout: days[day] ?? null }));
}

export const hoursOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h + m / 60;
};

/** Titles of meetings that overlap today's training slot. */
export function clashesWith(
  workout: Workout | null,
  events: { title: string; start: string; end: string }[],
  localHours: (iso: string) => number,
): string[] {
  if (!workout) return [];
  const s = hoursOf(workout.start);
  const f = hoursOf(workout.end);
  return events.filter((e) => localHours(e.start) < f && localHours(e.end) > s).map((e) => e.title);
}
