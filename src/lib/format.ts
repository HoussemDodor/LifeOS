const TZ = "Europe/Amsterdam";

/** Money in Dutch notation: € 1.976,55 (Houssem is Dutch; keep nl-NL for all amounts). */
export const eur = (n: number, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0, ...opts }).format(n);

export const time = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));

export const longDate = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(d);

export function relativeDue(ymd: string | undefined, today: Date): string {
  if (!ymd) return "";
  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(today);
  const diff = Math.round((Date.parse(ymd) - Date.parse(todayYmd)) / 86_400_000);
  if (diff < 0) return `${-diff}d overdue`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(ymd));
}

/** Hours since local midnight in Amsterdam, as a fraction (e.g. 9.5). */
export function localHours(iso: string | Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "numeric", hourCycle: "h23", timeZone: TZ })
    .formatToParts(typeof iso === "string" ? new Date(iso) : iso);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h + m / 60;
}
