import "server-only";
import { getDataSource, hasNotion, pageJsonBlock, plainText, queryDataSource } from "@/lib/notion";
import { db, hasDatabase } from "@/lib/supabase";
import { sampleBriefing, sampleNetWorth, sampleTasks } from "./sample";
import type { Briefing, NetWorthGlance, TaskItem } from "./types";

export interface TodayData {
  briefing: Briefing | null;
  tasks: TaskItem[];
  netWorth: NetWorthGlance | null;
  isSample: boolean;
}

const amsterdamDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(d);

/**
 * The 07:00 cloud routine writes one page per day to the Notion "LifeOS
 * Briefings" database (with the Briefing JSON in a code block) and adds tasks
 * to the MyLife OS "Tasks" database. This reads both back.
 */
async function briefingFromNotion(date: string): Promise<Briefing | null> {
  const { results } = await queryDataSource(process.env.NOTION_BRIEFINGS_DS!, {
    filter: { property: "Date", date: { equals: date } },
    page_size: 1,
  });
  return results[0] ? pageJsonBlock<Briefing>(results[0].id) : null;
}

async function tasksFromNotion(): Promise<TaskItem[]> {
  const ds = process.env.NOTION_TASKS_DS!;
  // The "done" checkbox in this database has an empty name, so find it by type.
  const { properties } = await getDataSource(ds);
  const done = Object.values(properties).find((p) => p.type === "checkbox");

  const { results } = await queryDataSource(ds, {
    filter: done ? { property: done.id, checkbox: { equals: false } } : undefined,
    sorts: [{ property: "Due Date", direction: "ascending" }],
    page_size: 8,
  });
  return results.map((p) => ({
    id: p.id,
    title: plainText(p.properties["Task"]) || "Untitled",
    due: p.properties["Due Date"]?.date?.start?.slice(0, 10),
    done: false,
    fromEmail: Boolean(plainText(p.properties["Email ID"])),
    url: p.url,
  }));
}

async function netWorthFromDb(): Promise<NetWorthGlance | null> {
  if (!hasDatabase()) return null;
  const { data } = await db().from("net_worth_daily").select("date,total").order("date", { ascending: false }).limit(30);
  const history = (data ?? []).map((r) => Number(r.total)).reverse();
  return history.length
    ? { total: history.at(-1)!, change30d: history.at(-1)! - history[0], currency: "EUR", history }
    : null;
}

export async function getTodayData(now = new Date()): Promise<TodayData> {
  if (!hasNotion()) {
    return { briefing: sampleBriefing(now), tasks: sampleTasks(now), netWorth: sampleNetWorth(), isSample: true };
  }
  const [briefing, tasks, netWorth] = await Promise.all([
    briefingFromNotion(amsterdamDate(now)),
    tasksFromNotion(),
    netWorthFromDb(),
  ]);
  return { briefing, tasks, netWorth, isSample: false };
}
