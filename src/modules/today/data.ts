import "server-only";
import { db, hasDatabase } from "@/lib/supabase";
import { sampleBriefing, sampleNetWorth, sampleTasks } from "./sample";
import type { Briefing, NetWorthGlance, TaskItem } from "./types";

export interface TodayData {
  briefing: Briefing | null;
  tasks: TaskItem[];
  netWorth: NetWorthGlance | null;
  isSample: boolean;
}

/**
 * The morning routine writes one row per day into `briefings` and mirrors the
 * open Notion tasks into `tasks_cache`. Until Supabase is configured, the
 * screen shows clearly-labelled sample data.
 */
export async function getTodayData(today = new Date()): Promise<TodayData> {
  if (!hasDatabase()) {
    return { briefing: sampleBriefing(today), tasks: sampleTasks(today), netWorth: sampleNetWorth(), isSample: true };
  }

  const date = today.toISOString().slice(0, 10);
  const [briefingRes, tasksRes, netWorthRes] = await Promise.all([
    db().from("briefings").select("payload").eq("date", date).maybeSingle(),
    db().from("tasks_cache").select("*").eq("done", false).order("due", { ascending: true, nullsFirst: false }).limit(8),
    db().from("net_worth_daily").select("date,total").order("date", { ascending: false }).limit(30),
  ]);

  const history = (netWorthRes.data ?? []).map((r) => Number(r.total)).reverse();
  const netWorth: NetWorthGlance | null = history.length
    ? { total: history.at(-1)!, change30d: history.at(-1)! - history[0], currency: "EUR", history }
    : null;

  return {
    briefing: (briefingRes.data?.payload as Briefing | undefined) ?? null,
    tasks: (tasksRes.data ?? []).map((t) => ({
      id: t.notion_page_id,
      title: t.title,
      due: t.due ?? undefined,
      done: t.done,
      fromEmail: Boolean(t.source_email_id),
      url: t.url ?? undefined,
    })),
    netWorth,
    isSample: false,
  };
}
