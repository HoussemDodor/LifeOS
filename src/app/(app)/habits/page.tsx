import { getHabits, HISTORY_DAYS } from "@/modules/habits/data";
import { HabitsBoard } from "@/modules/habits/HabitsBoard";

export const dynamic = "force-dynamic";

export default async function HabitsPage() {
  const { today, habits, isSample } = await getHabits();
  const doneToday = habits.filter((h) => h.done.includes(today)).length;

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Habits</h1>
      <p className="mt-2 text-muted">
        {habits.length
          ? `${doneToday} of ${habits.length} done today. Missed a day? You can tick the last week.`
          : "Small things you want to do every day. Tick them off here or on Today."}
      </p>
      {isSample && (
        <p className="mt-4 inline-block rounded-md border border-line px-2.5 py-1 text-xs text-muted">
          Showing sample data. Connect Supabase to keep your own.
        </p>
      )}
      <HabitsBoard habits={habits} today={today} historyDays={HISTORY_DAYS} />
    </>
  );
}
