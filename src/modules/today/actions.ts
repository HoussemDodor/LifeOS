"use server";

import { revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { getDataSource, getPage, hasNotion, NOTION_TAG, updatePageProperties } from "@/lib/notion";
import { devBypassEnabled, SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export type TaskActionResult = { ok: true } | { ok: false; error: string };

const NOTION_ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const sameId = (a?: string, b?: string) => Boolean(a && b) && a!.replace(/-/g, "") === b!.replace(/-/g, "");

/**
 * Tick a task in the Notion "Tasks" database done (or undo it).
 * Only pages that live in that database can be changed, and only the done checkbox.
 */
export async function setTaskDone(taskId: string, done: boolean): Promise<TaskActionResult> {
  // The middleware already gates this route; check again so the action never runs signed out.
  if (!devBypassEnabled() && !(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value))) {
    return { ok: false, error: "Sign in again to update tasks." };
  }
  if (typeof taskId !== "string" || typeof done !== "boolean") return { ok: false, error: "That task can’t be updated." };
  if (!hasNotion()) return { ok: true }; // sample data: nothing to write
  if (!NOTION_ID.test(taskId)) return { ok: false, error: "That task can’t be updated." };

  const ds = process.env.NOTION_TASKS_DS!;
  try {
    const page = await getPage(taskId);
    if (!sameId(page.parent?.data_source_id, ds)) return { ok: false, error: "That task can’t be updated." };

    const { properties } = await getDataSource(ds);
    const checkbox = Object.values(properties).find((p) => p.type === "checkbox");
    if (!checkbox) return { ok: false, error: "The Tasks database has no done checkbox." };

    await updatePageProperties(taskId, { [checkbox.id]: { checkbox: done } });
  } catch (err) {
    const msg = String(err);
    console.error("setTaskDone failed:", msg);
    if (/returned 403/.test(msg)) {
      return { ok: false, error: "Notion refused the change. Give the LifeOS integration “Update content” access." };
    }
    return { ok: false, error: "Couldn’t reach Notion. Try again in a moment." };
  }

  revalidateTag(NOTION_TAG);
  return { ok: true };
}
