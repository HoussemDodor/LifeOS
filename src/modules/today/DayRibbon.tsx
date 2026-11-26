import { localHours, time } from "@/lib/format";
import type { AgendaEvent } from "./types";

const START = 6; // the ribbon spans 06:00–24:00
const END = 24;
const pct = (h: number) => `${(Math.min(Math.max(h, START), END) - START) / (END - START) * 100}%`;

/** A single line for the whole day: meetings as blocks, a marker for now. */
export function DayRibbon({ events, now }: { events: AgendaEvent[]; now: Date }) {
  const nowH = localHours(now);
  const ticks = [6, 9, 12, 15, 18, 21, 24];

  return (
    <figure aria-label="Today's agenda" className="relative">
      <div className="relative h-14">
        {/* the track */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        {/* elapsed part of the day */}
        <div className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-muted/60" style={{ width: pct(nowH) }} />

        {events.map((e, i) => {
          const s = localHours(e.start);
          const f = localHours(e.end);
          const past = f <= nowH;
          return (
            <div
              key={e.id}
              className={`ribbon-block group absolute top-1/2 h-7 -translate-y-1/2 rounded-[3px] border ${
                past ? "border-muted/30 bg-muted/20" : "border-dawn/50 bg-dawn/20"
              }`}
              style={{ left: pct(s), width: `calc(${pct(f)} - ${pct(s)})`, animationDelay: `${120 + i * 80}ms` }}
            >
              <span className="sr-only">
                {e.title}, {time(e.start)}–{time(e.end)}
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
        {events.map((e) => {
          const past = localHours(e.end) <= nowH;
          return (
            <li key={e.id} className={past ? "text-faint" : ""}>
              <div className="text-sm tabular-nums text-muted">
                {time(e.start)}–{time(e.end)}
              </div>
              <div className="mt-0.5 text-[15px]">{e.title}</div>
              {e.location && <div className="text-sm text-faint">{e.location}</div>}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
