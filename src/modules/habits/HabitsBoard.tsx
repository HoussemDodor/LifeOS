"use client";

import { useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { addHabit, archiveHabit, renameHabit } from "./actions";
import { lastDays } from "./streak";
import { EDITABLE_DAYS, type HabitActionResult, type HabitView } from "./types";
import { useHabitDays } from "./useHabitDays";

const weekday = (ymd: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`));
const dayNum = (ymd: string) => Number(ymd.slice(8));
const longDay = (ymd: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${ymd}T00:00:00Z`),
  );

export function HabitsBoard({
  habits: initial,
  today,
  historyDays,
}: {
  habits: HabitView[];
  today: string;
  historyDays: number;
}) {
  const { habits, toggle, error } = useHabitDays(initial, today);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const week = lastDays(today, EDITABLE_DAYS);
  const history = lastDays(today, historyDays);

  function run(action: () => Promise<HabitActionResult>, after?: () => void) {
    setMessage(null);
    startTransition(async () => {
      const res = await action();
      if (res.ok) after?.();
      else setMessage(res.error);
    });
  }

  return (
    <>
      {habits.length > 0 && (
        <div className="mt-10 flex items-baseline justify-between">
          <h2 className="text-sm text-muted">Last 7 days</h2>
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="rounded text-sm text-muted underline-offset-4 hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-dawn"
          >
            {editing ? "Done editing" : "Edit habits"}
          </button>
        </div>
      )}

      <ul className="mt-4 divide-y divide-line border-y border-line empty:border-0">
        {habits.map((h) => {
          const done = new Set(h.done);
          return (
            <li key={h.id} className="py-5">
              {editing ? (
                <EditRow habit={h} pending={pending} run={run} />
              ) : (
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-[17px] font-medium">{h.name}</h3>
                  <p className="text-sm tabular-nums text-muted">
                    {h.current > 0 ? (
                      <>
                        <span className="text-text">{h.current}</span>-day streak
                      </>
                    ) : (
                      "No streak yet"
                    )}
                    {h.best > 0 && <span className="text-faint"> · best {h.best}</span>}
                  </p>
                </div>
              )}

              <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <fieldset>
                  <legend className="sr-only">{h.name}, last 7 days</legend>
                  <div className="grid grid-cols-7 gap-1.5">
                    {week.map((day) => {
                      const isDone = done.has(day);
                      const isToday = day === today;
                      return (
                        <label
                          key={day}
                          className="flex w-10 cursor-pointer flex-col items-center gap-1.5 text-xs"
                          title={longDay(day)}
                        >
                          <span className={isToday ? "text-dawn" : "text-faint"}>{isToday ? "Today" : weekday(day)}</span>
                          <input
                            type="checkbox"
                            className="peer sr-only"
                            checked={isDone}
                            aria-label={longDay(day)}
                            onChange={(e) => toggle(h.id, day, e.target.checked)}
                          />
                          <span
                            aria-hidden="true"
                            className={`grid size-9 place-items-center rounded-full border tabular-nums transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-dawn peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-ink ${
                              isDone
                                ? isToday
                                  ? "border-dawn bg-dawn text-ink"
                                  : "border-transparent bg-text/75 text-ink"
                                : `${isToday ? "border-dawn/60" : "border-line"} text-muted hover:border-faint`
                            }`}
                          >
                            {isDone ? <Check className="size-4" strokeWidth={2.5} /> : dayNum(day)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <History days={history} done={done} today={today} name={h.name} />
              </div>
            </li>
          );
        })}
      </ul>

      {(error || message) && (
        <p role="status" className="mt-3 text-sm text-loss">
          {error ?? message}
        </p>
      )}

      <AddHabit pending={pending} run={run} first={habits.length === 0} />
    </>
  );
}

/** 12 weeks as a small dot grid: one column per week, newest on the right. */
function History({ days, done, today, name }: { days: string[]; done: Set<string>; today: string; name: string }) {
  const count = days.filter((d) => done.has(d)).length;
  return (
    <div>
      <div
        role="img"
        aria-label={`${name}: done on ${count} of the last ${days.length} days`}
        className="grid w-max grid-flow-col grid-rows-7 gap-[3px]"
      >
        {days.map((d) => (
          <span
            key={d}
            title={`${longDay(d)}${done.has(d) ? ": done" : ""}`}
            className={`size-2 rounded-[2px] ${done.has(d) ? "bg-text/75" : "bg-line"} ${
              d === today ? "outline outline-1 outline-offset-1 outline-dawn" : ""
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-faint tabular-nums">
        {count} of {days.length} days
      </p>
    </div>
  );
}

type Run = (action: () => Promise<HabitActionResult>, after?: () => void) => void;

function EditRow({ habit, pending, run }: { habit: HabitView; pending: boolean; run: Run }) {
  const [name, setName] = useState(habit.name);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => renameHabit(habit.id, name));
      }}
    >
      <label className="sr-only" htmlFor={`name-${habit.id}`}>
        Habit name
      </label>
      <input
        id={`name-${habit.id}`}
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-[15px] focus-visible:border-faint focus-visible:outline-2 focus-visible:outline-dawn"
      />
      <button
        type="submit"
        disabled={pending || name.trim() === habit.name}
        className="rounded-md border border-line px-3 py-2 text-sm hover:bg-surface disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-dawn"
      >
        Rename
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => archiveHabit(habit.id))}
        className="rounded-md px-3 py-2 text-sm text-muted hover:text-loss disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-dawn"
      >
        Archive
      </button>
    </form>
  );
}

function AddHabit({ pending, run, first }: { pending: boolean; run: Run; first: boolean }) {
  const [name, setName] = useState("");
  const input = useRef<HTMLInputElement>(null);
  return (
    <form
      className="mt-8 flex max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => addHabit(name),
          () => {
            setName("");
            input.current?.focus();
          },
        );
      }}
    >
      <label className="sr-only" htmlFor="new-habit">
        New habit
      </label>
      <input
        ref={input}
        id="new-habit"
        value={name}
        maxLength={60}
        placeholder={first ? "Your first habit, e.g. Read 20 pages" : "Another habit"}
        onChange={(e) => setName(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-[15px] placeholder:text-faint focus-visible:border-faint focus-visible:outline-2 focus-visible:outline-dawn"
      />
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="shrink-0 rounded-md bg-dawn px-4 py-2 text-sm font-medium text-ink hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dawn"
      >
        Add habit
      </button>
    </form>
  );
}
