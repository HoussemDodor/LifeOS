/** Date helpers on plain YYYY-MM-DD strings (Amsterdam calendar days). */

export const amsterdamYmd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(d);

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The last `n` days ending with `today`, oldest first. */
export const lastDays = (today: string, n: number) => Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));

/**
 * Current streak: consecutive done days ending today. If today isn't ticked
 * yet the streak is still alive and counts back from yesterday.
 */
export function currentStreak(done: Set<string>, today: string): number {
  let day = done.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (done.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function bestStreak(done: Set<string>): number {
  let best = 0;
  for (const day of done) {
    if (done.has(addDays(day, -1))) continue; // not the start of a run
    let n = 0;
    while (done.has(addDays(day, n))) n++;
    best = Math.max(best, n);
  }
  return best;
}
