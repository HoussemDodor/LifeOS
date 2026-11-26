import { Dumbbell } from "lucide-react";
import { weekdayOf, weekPlan } from "@/modules/health/schedule";

export const dynamic = "force-dynamic";

const label = (d: string) => d[0].toUpperCase() + d.slice(1);

export default function HealthPage() {
  const today = weekdayOf(new Date());
  const plan = weekPlan();
  const sessions = plan.filter((p) => p.workout).length;
  const todayIdx = plan.findIndex((p) => p.day === today);
  const next = [...plan.slice(todayIdx + 1), ...plan.slice(0, todayIdx + 1)].find((p) => p.workout);
  const todays = plan[todayIdx].workout;

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Health & training</h1>
      <p className="mt-2 text-muted">
        {todays
          ? `Today is ${todays.session.toLowerCase()} day, ${todays.start}–${todays.end}.`
          : `Rest day. Next up: ${next?.workout?.session.toLowerCase()} on ${label(next?.day ?? "")}.`}{" "}
        {sessions} sessions a week.
      </p>

      <ol className="mt-12 divide-y divide-line border-y border-line">
        {plan.map(({ day, workout }) => {
          const isToday = day === today;
          return (
            <li
              key={day}
              aria-current={isToday ? "date" : undefined}
              className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-6 gap-y-1 py-4 sm:grid-cols-[8rem_9rem_minmax(0,1fr)]"
            >
              <span className={`flex items-center gap-2 ${isToday ? "text-text" : "text-muted"}`}>
                {isToday && <span className="size-1.5 rounded-full bg-dawn" aria-hidden="true" />}
                {label(day)}
              </span>
              {workout ? (
                <>
                  <span className="flex items-center gap-1.5 text-[15px]">
                    <Dumbbell className={`size-3.5 ${isToday ? "text-gain" : "text-faint"}`} strokeWidth={2} aria-hidden="true" />
                    {workout.session}
                  </span>
                  <span className="col-start-2 text-sm text-muted sm:col-start-3">
                    <span className="tabular-nums">{workout.start}–{workout.end}</span>
                    <span className="text-faint"> · {workout.focus}</span>
                  </span>
                </>
              ) : (
                <span className="text-[15px] text-faint">Rest</span>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-6 text-sm text-faint">
        Workout history, streaks and last week’s top sets appear here once Hevy is connected.
      </p>
    </>
  );
}
