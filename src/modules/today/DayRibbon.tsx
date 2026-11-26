import { Dumbbell } from "lucide-react";
import { localHours, time } from "@/lib/format";
import { hoursOf, type Workout } from "@/modules/health/schedule";
import type { AgendaEvent } from "./types";

const START = 6; // the ribbon spans 06:00–24:00
const END = 24;
const pct = (h: number) => `${(Math.min(Math.max(h, START), END) - START) / (END - START) * 100}%`;

type Item =
  | { kind: "event"; id: string; title: string; s: number; f: number; label: string; sub?: string }
  | { kind: "workout"; id: string; title: string; s: number; f: number; label: string; sub?: string };

/** A single line for the whole day: meetings and today's training as blocks, a marker for now. */
export function DayRibbon({ events, workout, now }: { events: AgendaEvent[]; workout: Workout | null; now: Date }) {
  const nowH = localHours(now);
  const ticks = [6, 9, 12, 15, 18, 21, 24];

  const items: Item[] = [
    ...events.map((e) => ({
      kind: "event" as const,
      id: e.id,
      title: e.title,
      s: localHours(e.start),
      f: localHours(e.end),
      label: `${time(e.start)}–${time(e.end)}`,
      sub: e.location,
    })),
    ...(workout
      ? [{
          kind: "workout" as const,
          id: "workout",
          title: `${workout.session} day`,
          s: hoursOf(workout.start),
          f: hoursOf(workout.end),
          label: `${workout.start}–${workout.end}`,
          sub: workout.focus,
        }]
      : []),
  ].sort((a, b) => a.s - b.s);

  return (
    <figure aria-label="Today's agenda" className="relative">
      <div className="relative h-14">
        {/* the track */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        {/* elapsed part of the day */}
        <div className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-muted/60" style={{ width: pct(nowH) }} />

        {items.map((it, i) => {
          const past = it.f <= nowH;
          const tone =
            it.kind === "workout"
              ? past ? "border-gain/25 bg-gain/10" : "border-gain/60 bg-gain/20"
              : past ? "border-muted/30 bg-muted/20" : "border-dawn/50 bg-dawn/20";
          return (
            <div
              key={it.id}
              className={`ribbon-block absolute top-1/2 h-7 -translate-y-1/2 rounded-[3px] border ${tone}`}
              style={{ left: pct(it.s), width: `calc(${pct(it.f)} - ${pct(it.s)})`, animationDelay: `${120 + i * 80}ms` }}
            >
              <span className="sr-only">
                {it.title}, {it.label}
              </span>
            </div>
          );
        })}

        {/* now */}
        {nowH >= START && (
          <div className="absolute top-0 bottom-0 w-px bg-dawn" style={{ left: pct(nowH) }}>
            <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-dawn" />
          </div>
        )}
      </div>

      <div className="relative mt-1 h-4 text-[11px] text-faint">
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: pct(t) }}>
            {String(t % 24).padStart(2, "0")}
          </span>
        ))}
      </div>

      <ol className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => {
          const past = it.f <= nowH;
          return (
            <li key={it.id} className={past ? "text-faint" : ""}>
              <div className="text-sm tabular-nums text-muted">{it.label}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[15px]">
                {it.kind === "workout" && (
                  <Dumbbell className={`size-3.5 ${past ? "" : "text-gain"}`} strokeWidth={2} aria-hidden="true" />
                )}
                {it.title}
              </div>
              {it.sub && <div className="text-sm text-faint">{it.sub}</div>}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
