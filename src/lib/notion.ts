import "server-only";

/**
 * Minimal Notion REST client (no SDK). Needs an internal integration token
 * with read access to the "LifeOS Briefings" and "Tasks" databases:
 * notion.so/profile/integrations → New integration → copy the secret, then on
 * each database: ••• → Connections → add the integration.
 */
const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";

export function hasNotion(): boolean {
  return Boolean(process.env.NOTION_TOKEN && process.env.NOTION_BRIEFINGS_DS && process.env.NOTION_TASKS_DS);
}

async function notion<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": VERSION,
      "Content-Type": "application/json",
    },
    // Briefings change once a day; tasks more often. Five minutes keeps it fresh without hammering the API.
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Notion ${path} returned ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Page = { id: string; url: string; properties: Record<string, any> };
type QueryResult = { results: Page[] };
type Block = { type: string; code?: { rich_text: { plain_text: string }[]; language: string } };

export function queryDataSource(id: string, body: object) {
  return notion<QueryResult>(`/data_sources/${id}/query`, { method: "POST", body: JSON.stringify(body) });
}

export function getDataSource(id: string) {
  return notion<{ properties: Record<string, { id: string; name: string; type: string }> }>(`/data_sources/${id}`);
}

export async function pageJsonBlock<T>(pageId: string): Promise<T | null> {
  const { results } = await notion<{ results: Block[] }>(`/blocks/${pageId}/children?page_size=100`);
  const code = results.find((b) => b.type === "code" && b.code?.language === "json");
  if (!code?.code) return null;
  try {
    return JSON.parse(code.code.rich_text.map((t) => t.plain_text).join("")) as T;
  } catch {
    return null;
  }
}

export const plainText = (prop: any): string =>
  (prop?.title ?? prop?.rich_text ?? []).map((t: { plain_text: string }) => t.plain_text).join("");
/* eslint-enable @typescript-eslint/no-explicit-any */
