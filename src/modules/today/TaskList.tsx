"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { setTaskDone } from "./actions";

export interface TaskRow {
  id: string;
  title: string;
  dueLabel: string;
  dueSoon: boolean;
  fromEmail: boolean;
}

type Notice = { kind: "done"; task: TaskRow } | { kind: "error"; message: string } | null;

/** Open Notion tasks with a checkbox that ticks them off in Notion. */
export function TaskList({ tasks }: { tasks: TaskRow[] }) {
  // Ticked tasks stay visible (struck through) until the next page load, so nothing jumps.
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();

  // Keep ticked tasks in view even after the refreshed list from Notion drops them.
  const [shown, setShown] = useState(tasks);
  const rows = [...shown, ...tasks.filter((t) => !shown.some((s) => s.id === t.id))];

  function toggle(task: TaskRow, done: boolean) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (done) next.add(task.id);
      else next.delete(task.id);
      return next;
    });
    setShown(rows);
    setNotice(done ? { kind: "done", task } : null);

    startTransition(async () => {
      const res = await setTaskDone(task.id, done);
      if (!res.ok) {
        setTicked((prev) => {
          const next = new Set(prev);
          if (done) next.delete(task.id);
          else next.add(task.id);
          return next;
        });
        setNotice({ kind: "error", message: res.error });
      }
    });
  }

  return (
    <>
      {rows.length ? (
        <ul className="mt-4 space-y-1">
          {rows.map((t) => {
            const isDone = ticked.has(t.id);
            return (
              <li key={t.id}>
                <label className="-mx-2 flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-surface">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={isDone}
                    onChange={(e) => toggle(t, e.target.checked)}
                  />
                  <span
                    aria-hidden="true"
                    className={`mt-1 grid size-4 shrink-0 place-items-center rounded-[4px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-dawn peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-ink ${
                      isDone ? "border-dawn bg-dawn text-ink" : "border-faint"
                    }`}
                  >
                    {isDone && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-[15px] leading-snug transition-colors ${isDone ? "text-faint line-through" : ""}`}
                    >
                      {t.title}
                    </span>
                    <span className="block text-xs text-faint">
                      <span className={t.dueSoon && !isDone ? "text-dawn" : ""}>{t.dueLabel}</span>
                      {t.fromEmail && " · from email"}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-muted">Nothing open. Enjoy it.</p>
      )}

      <div role="status" className="mt-3 min-h-5 text-sm">
        {notice?.kind === "done" && (
          <p className="text-muted">
            Marked done.{" "}
            <button
              type="button"
              disabled={pending}
              onClick={() => toggle(notice.task, false)}
              className="rounded text-dawn underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-dawn disabled:opacity-50"
            >
              Undo
            </button>
          </p>
        )}
        {notice?.kind === "error" && <p className="text-loss">{notice.message}</p>}
      </div>
    </>
  );
}
