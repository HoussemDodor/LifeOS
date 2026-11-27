"use server";

import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/require-session";
import { db, hasDatabase } from "@/lib/supabase";
import { addDays, amsterdamYmd } from "./streak";
import { EDITABLE_DAYS, type HabitActionResult } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (error: string): HabitActionResult => ({ ok: false, error });

async function guard(): Promise<HabitActionResult | null> {
  if (!(await isSignedIn())) return fail("Sign in again to update habits.");
  if (!hasDatabase()) return { ok: true }; // sample data: nothing to write
  return null;
}

function cleanName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const n = name.replace(/\s+/g, " ").trim();
  return n.length >= 1 && n.length <= 60 ? n : null;
}

function refresh() {
  revalidatePath("/habits");
  revalidatePath("/");
}

/** Tick or untick a habit for one day (today or up to a week back). */
export async function setHabitDay(habitId: string, day: string, done: boolean): Promise<HabitActionResult> {
  const stop = await guard();
  if (stop) return stop;
  const today = amsterdamYmd(new Date());
  if (
    typeof habitId !== "string" ||
    !UUID.test(habitId) ||
    typeof day !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    day > today ||
    day < addDays(today, -(EDITABLE_DAYS - 1)) ||
    typeof done !== "boolean"
  ) {
    return fail("That day can’t be changed.");
  }

  const { error } = done
    ? await db().from("habit_checks").upsert({ habit_id: habitId, day }, { ignoreDuplicates: true })
    : await db().from("habit_checks").delete().eq("habit_id", habitId).eq("day", day);
  if (error) {
    console.error("setHabitDay:", error.message);
    return fail("Couldn’t save. Try again.");
  }
  refresh();
  return { ok: true };
}

export async function addHabit(name: string): Promise<HabitActionResult> {
  const stop = await guard();
  if (stop) return stop;
  const clean = cleanName(name);
  if (!clean) return fail("Give the habit a name of up to 60 characters.");

  const { count } = await db().from("habits").select("id", { count: "exact", head: true }).is("archived_at", null);
  if ((count ?? 0) >= 20) return fail("That’s 20 habits already. Archive one first.");

  const { error } = await db().from("habits").insert({ name: clean, sort: count ?? 0 });
  if (error) {
    console.error("addHabit:", error.message);
    return fail("Couldn’t add the habit. Try again.");
  }
  refresh();
  return { ok: true };
}

export async function renameHabit(habitId: string, name: string): Promise<HabitActionResult> {
  const stop = await guard();
  if (stop) return stop;
  const clean = cleanName(name);
  if (typeof habitId !== "string" || !UUID.test(habitId)) return fail("That habit can’t be changed.");
  if (!clean) return fail("Give the habit a name of up to 60 characters.");

  const { error } = await db().from("habits").update({ name: clean }).eq("id", habitId);
  if (error) return fail("Couldn’t rename. Try again.");
  refresh();
  return { ok: true };
}

/** Archive hides a habit but keeps its history; nothing is deleted. */
export async function archiveHabit(habitId: string): Promise<HabitActionResult> {
  const stop = await guard();
  if (stop) return stop;
  if (typeof habitId !== "string" || !UUID.test(habitId)) return fail("That habit can’t be changed.");

  const { error } = await db().from("habits").update({ archived_at: new Date().toISOString() }).eq("id", habitId);
  if (error) return fail("Couldn’t archive. Try again.");
  refresh();
  return { ok: true };
}
